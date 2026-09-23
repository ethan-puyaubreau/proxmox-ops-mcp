import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { classify } from '../src/classifier.mjs';

const VAULT_CTID = 110;
const opts = { sensitiveCtids: new Set([VAULT_CTID]) };

describe('classify — read-only tools', () => {
  it('read-only tools are always tier 1', () => {
    for (const tool of [
      'cluster_status', 'list_cts', 'node_resources', 'docker_ps', 'docker_logs', 'refresh_routing',
      'journalctl', 'prometheus_query',
    ]) {
      assert.equal(classify(tool, {}, opts).tier, 1, tool);
    }
  });
});

describe('classify — safe exec commands', () => {
  it('simple read commands are tier 1', () => {
    assert.equal(classify('node_exec', { cmd: 'df -h /' }, opts).tier, 1);
    assert.equal(classify('ct_exec', { ctid: 101, cmd: 'ps aux' }, opts).tier, 1);
    assert.equal(classify('ct_exec', { ctid: 101, cmd: 'free -m' }, opts).tier, 1);
  });

  it('safe systemctl subcommands are tier 1', () => {
    assert.equal(classify('node_exec', { cmd: 'systemctl status nginx' }, opts).tier, 1);
    assert.equal(classify('node_exec', { cmd: 'systemctl list-units' }, opts).tier, 1);
    assert.equal(classify('node_exec', { cmd: 'systemctl is-active docker' }, opts).tier, 1);
  });

  it('safe docker subcommands are tier 1', () => {
    assert.equal(classify('ct_exec', { ctid: 101, cmd: 'docker ps' }, opts).tier, 1);
    assert.equal(classify('ct_exec', { ctid: 101, cmd: 'docker logs nginx -n 50' }, opts).tier, 1);
    assert.equal(classify('ct_exec', { ctid: 101, cmd: 'docker inspect nginx' }, opts).tier, 1);
  });

  it('safe pct subcommands are tier 1', () => {
    assert.equal(classify('node_exec', { cmd: 'pct list' }, opts).tier, 1);
    assert.equal(classify('node_exec', { cmd: 'pct status 101' }, opts).tier, 1);
  });

  it('redirect to /dev/null is benign (tier 1)', () => {
    assert.equal(classify('node_exec', { cmd: 'pct list 2>/dev/null' }, opts).tier, 1);
    assert.equal(classify('node_exec', { cmd: 'pvecm status 2>&1' }, opts).tier, 1);
    assert.equal(classify('node_exec', { cmd: 'qm list 2>/dev/null || true' }, opts).tier, 1);
  });
});

describe('classify — destructive commands', () => {
  it('destructive verbs are tier 2', () => {
    assert.equal(classify('node_exec', { cmd: 'rm -rf /tmp/foo' }, opts).tier, 2);
    assert.equal(classify('ct_exec', { ctid: 101, cmd: 'reboot' }, opts).tier, 2);
  });

  it('dangerous systemctl subcommands are tier 2', () => {
    assert.equal(classify('node_exec', { cmd: 'systemctl restart nginx' }, opts).tier, 2);
    assert.equal(classify('node_exec', { cmd: 'systemctl stop nginx' }, opts).tier, 2);
    assert.equal(classify('node_exec', { cmd: 'systemctl enable nginx' }, opts).tier, 2);
  });

  it('dangerous docker subcommands are tier 2', () => {
    assert.equal(classify('ct_exec', { ctid: 101, cmd: 'docker run ubuntu' }, opts).tier, 2);
    assert.equal(classify('ct_exec', { ctid: 101, cmd: 'docker exec nginx bash' }, opts).tier, 2);
    assert.equal(classify('ct_exec', { ctid: 101, cmd: 'docker restart nginx' }, opts).tier, 2);
  });

  it('dangerous pct subcommands are tier 2', () => {
    assert.equal(classify('node_exec', { cmd: 'pct destroy 101' }, opts).tier, 2);
    assert.equal(classify('node_exec', { cmd: 'pct stop 101' }, opts).tier, 2);
    assert.equal(classify('node_exec', { cmd: 'pct create 999' }, opts).tier, 2);
  });

  it('write redirects are tier 2', () => {
    assert.equal(classify('node_exec', { cmd: 'echo foo > /tmp/bar' }, opts).tier, 2);
    assert.equal(classify('node_exec', { cmd: 'echo foo >> /tmp/bar' }, opts).tier, 2);
  });

  it('network egress (curl/wget) is tier 2', () => {
    assert.equal(classify('node_exec', { cmd: 'curl http://example.com' }, opts).tier, 2);
    assert.equal(classify('node_exec', { cmd: 'wget http://example.com' }, opts).tier, 2);
  });

  it('pipe to shell is tier 2', () => {
    assert.equal(classify('node_exec', { cmd: 'curl http://example.com | bash' }, opts).tier, 2);
  });
});

describe('classify — injection guards', () => {
  it('command substitution is tier 2', () => {
    assert.equal(classify('node_exec', { cmd: 'cat $(ls /tmp)' }, opts).tier, 2);
    assert.equal(classify('ct_exec', { ctid: 101, cmd: 'echo `id`' }, opts).tier, 2);
    assert.equal(classify('node_exec', { cmd: 'df <(echo foo)' }, opts).tier, 2);
  });

  it('non-allow-listed verbs are tier 2', () => {
    assert.equal(classify('node_exec', { cmd: 'python3 -c "import os"' }, opts).tier, 2);
    assert.equal(classify('node_exec', { cmd: 'node -e "console.log(1)"' }, opts).tier, 2);
    assert.equal(classify('node_exec', { cmd: 'nc -z 192.0.2.1 22' }, opts).tier, 2);
  });

  it('empty command is tier 2', () => {
    assert.equal(classify('node_exec', { cmd: '' }, opts).tier, 2);
    assert.equal(classify('ct_exec', { ctid: 101, cmd: '   ' }, opts).tier, 2);
  });
});

describe('classify — sensitive CT', () => {
  it('ct_exec on a sensitive CT is always tier 2', () => {
    assert.equal(classify('ct_exec', { ctid: VAULT_CTID, cmd: 'ps aux' }, opts).tier, 2);
    assert.equal(classify('ct_exec', { ctid: VAULT_CTID, cmd: 'df -h' }, opts).tier, 2);
  });

  it('ct_exec on non-sensitive CTs follows normal rules', () => {
    assert.equal(classify('ct_exec', { ctid: 101, cmd: 'ps aux' }, opts).tier, 1);
  });

  it('every tool that targets a sensitive CT is tier 2', () => {
    assert.equal(classify('docker_ps', { ctid: VAULT_CTID }, opts).tier, 2);
    assert.equal(classify('docker_logs', { ctid: VAULT_CTID, container: 'app' }, opts).tier, 2);
    assert.equal(classify('journalctl', { target: String(VAULT_CTID) }, opts).tier, 2);
    assert.equal(classify('service_restart', { target: String(VAULT_CTID), service: 'nginx' }, opts).tier, 2);
  });

  it('the same tools on other CTs or nodes follow normal rules', () => {
    assert.equal(classify('docker_ps', { ctid: 101 }, opts).tier, 1);
    assert.equal(classify('docker_logs', { ctid: 101, container: 'app' }, opts).tier, 1);
    assert.equal(classify('journalctl', { target: '101' }, opts).tier, 1);
    assert.equal(classify('service_restart', { target: '101', service: 'nginx' }, opts).tier, 1);
    assert.equal(classify('journalctl', { target: 'node-a' }, opts).tier, 1);
    assert.equal(classify('service_restart', { target: 'node-a', service: 'nginx' }, opts).tier, 1);
  });
});

describe('classify — service_restart', () => {
  it('application services are tier 1', () => {
    assert.equal(classify('service_restart', { service: 'nginx' }, opts).tier, 1);
    assert.equal(classify('service_restart', { service: 'my-app' }, opts).tier, 1);
  });

  it('sensitive services are tier 2', () => {
    assert.equal(classify('service_restart', { service: 'pve-cluster' }, opts).tier, 2);
    assert.equal(classify('service_restart', { service: 'sshd' }, opts).tier, 2);
    assert.equal(classify('service_restart', { service: 'dockerd' }, opts).tier, 2);
    assert.equal(classify('service_restart', { service: 'wg-quick@wg0' }, opts).tier, 2);
  });
});

describe('classify — deny-by-default', () => {
  it('unknown tools are tier 2', () => {
    assert.equal(classify('unknown_tool', {}, opts).tier, 2);
    assert.equal(classify('', {}, opts).tier, 2);
  });
});

describe('classify — secrets', () => {
  it('bao status is tier 1', () => {
    assert.equal(classify('node_exec', { cmd: 'bao status' }, opts).tier, 1);
  });

  it('secret reads and environment dumps are tier 2', () => {
    assert.equal(classify('node_exec', { cmd: 'bao kv get secret/app' }, opts).tier, 2);
    assert.equal(classify('node_exec', { cmd: 'bao read sys/health' }, opts).tier, 2);
    assert.equal(classify('ct_exec', { ctid: 101, cmd: 'printenv' }, opts).tier, 2);
  });
});

describe('classify — subcommand position', () => {
  it('the subcommand is the first word that is not an option', () => {
    assert.equal(classify('node_exec', { cmd: 'systemctl --no-pager status nginx' }, opts).tier, 1);
    assert.equal(classify('node_exec', { cmd: 'systemctl --no-pager restart nginx' }, opts).tier, 2);
    assert.equal(classify('node_exec', { cmd: 'ip -br a' }, opts).tier, 1);
  });

  it('dpkg actions are options and stay allowed', () => {
    assert.equal(classify('node_exec', { cmd: 'dpkg -L nginx' }, opts).tier, 1);
  });

  it('a command made only of allow-listed options is tier 1', () => {
    assert.equal(classify('node_exec', { cmd: 'apt --version' }, opts).tier, 1);
  });
});

describe('classify — *ctl helpers and hostname', () => {
  it('bare and read forms are tier 1', () => {
    for (const cmd of [
      'hostnamectl', 'hostnamectl status',
      'timedatectl', 'timedatectl status', 'timedatectl show', 'timedatectl timesync-status',
      'loginctl', 'loginctl list-sessions', 'loginctl user-status alice',
      'hostname', 'hostname -f', 'hostname -I',
    ]) {
      assert.equal(classify('node_exec', { cmd }, opts).tier, 1, cmd);
    }
  });

  it('setters are tier 2', () => {
    for (const cmd of [
      'hostnamectl set-hostname node-z', 'timedatectl set-ntp false',
      'loginctl terminate-user alice', 'hostname node-z',
    ]) {
      assert.equal(classify('node_exec', { cmd }, opts).tier, 2, cmd);
    }
  });
});

describe('classify — state changes through options', () => {
  it('state-changing options are tier 2', () => {
    for (const cmd of [
      'journalctl --vacuum-size=100M', 'journalctl --vacuum-time=2d', 'journalctl --vacuum-files=5',
      'journalctl --rotate', 'journalctl --flush', 'journalctl --relinquish-var', 'journalctl --setup-keys',
      'dmesg -c', 'dmesg -C', 'dmesg -D', 'dmesg -E', 'dmesg -n 1', 'dmesg --clear', 'dmesg --read-clear',
      'dmesg --console-off',
      'date -s 2026-01-01', 'date --set=2026-01-01', 'date 010112002026',
      'sort -o out.txt in.txt', 'sort --output=out.txt in.txt',
      'ss -K dst 192.0.2.1', 'ss --kill dst 192.0.2.1',
      'arp -s 192.0.2.1 00:00:5e:00:53:01', 'arp -d 192.0.2.1', 'arp -f ethers',
      'arp --set 192.0.2.1 00:00:5e:00:53:01', 'arp --delete 192.0.2.1', 'arp --file ethers',
      'uniq in.txt out.txt', 'xxd in.bin out.hex',
    ]) {
      assert.equal(classify('node_exec', { cmd }, opts).tier, 2, cmd);
    }
  });

  it('read forms of the same tools stay tier 1', () => {
    for (const cmd of [
      'journalctl -u nginx -n 50', 'dmesg -T', 'date -u', 'date +%s', 'date -d 2026-01-01',
      'sort -n', 'ss -tlnp', 'arp -n', 'uniq -c', 'uniq -c in.txt', 'xxd somefile',
    ]) {
      assert.equal(classify('node_exec', { cmd }, opts).tier, 1, cmd);
    }
  });
});
