// Two-tier execution classifier.
// Tier 1 = auto (read / benign repair, executed immediately).
// Tier 2 = out-of-band approval required (PENDING queue + Gjallarhorn) before execution.
// Guiding principle: DENY-BY-DEFAULT on arbitrary shell execution.
//   "read and repair = fine; destroy or reconfigure = rings the bell."
// A prompt-injection attack requesting something destructive hits the out-of-band step
// and cannot self-approve.

// Tools that are inherently read-only -> always Tier 1.
const READONLY_TOOLS = new Set([
  'cluster_status', 'list_cts', 'node_resources', 'docker_ps', 'docker_logs', 'refresh_routing',
  'journalctl', 'prometheus_query',
]);

// Tools that execute arbitrary shell commands -> classified by the command.
const EXEC_TOOLS = new Set(['node_exec', 'ct_exec', 'standalone_exec']);

// Services that are sensitive; restarting them is Tier 2.
const SENSITIVE_SERVICES = /pve-cluster|pvedaemon|pveproxy|corosync|^ssh$|ssh\.socket|sshd|dockerd|containerd|\.socket$|openbao|networking|systemd-network|firewall|wg-|wireguard/i;

// Safe head verbs (read / diagnostic). Every segment must start with one of these.
const SAFE_READ = new Set([
  'cat','ls','ll','grep','egrep','fgrep','zgrep','tail','head','wc','sort','uniq','awk','cut','tr','column','nl','tac',
  'find','stat','file','readlink','realpath','basename','dirname','tree','diff','cmp','strings',
  'df','du','free','ps','pgrep','uptime','w','who','whoami','id','hostname','hostnamectl','uname','date','locale','lscpu','lsmem','lsblk','blkid','findmnt',
  'echo','printf','true','false','test','which','type',
  'systemctl','journalctl','dmesg','loginctl','timedatectl',
  'ip','ss','netstat','ping','dig','nslookup','host','getent','arp',
  'pct','qm','pvesm','pvecm','pvesh','zfs','zpool','lvs','vgs','pvs','mount',
  'docker','wg','bao','jq','sha256sum','md5sum','base64','xxd','sleep','seq','apt','dpkg',
]);

// For multi-purpose binaries, allow Tier 1 only on these subcommands (read/inspect).
const SAFE_SUBCMD = {
  systemctl: new Set(['status','is-active','is-enabled','is-failed','list-units','list-unit-files','list-timers','list-dependencies','show','cat','get-default']),
  pct:    new Set(['list','config','status','df','listsnapshot','cmdlist']),
  qm:     new Set(['list','config','status','showcmd','listsnapshot']),
  pvesm:  new Set(['status','list','scan','apiinfo']),
  pvecm:  new Set(['status','nodes']),
  pvesh:  new Set(['get','ls','usage']),
  docker: new Set(['ps','logs','inspect','images','image','stats','top','version','info','port','diff','events','system','volume','network']),
  zfs:    new Set(['list','get','version']),
  zpool:  new Set(['status','list','get','iostat','version']),
  ip:     new Set(['a','addr','route','link','neigh','rule']),
  wg:     new Set(['show','showconf']),
  apt:    new Set(['list','show','policy','search','--version','-v']),
  dpkg:   new Set(['-l','-L','-s','--list','--status','-S','--search','--get-selections','-p']),
  bao:    new Set(['status','version']),
  mount:  new Set([]),
  hostnamectl: new Set(['status']),
  timedatectl: new Set(['status','show','list-timezones','timesync-status','show-timesync']),
  loginctl: new Set(['list-sessions','list-users','list-seats','show-session','show-user','show-seat','session-status','user-status','seat-status']),
  // Only options: an operand would set the hostname.
  hostname: new Set(['-f','--fqdn','-s','--short','-d','--domain','-i','--ip-address','-I','--all-ip-addresses','-A','--all-fqdns','-a','--alias']),
};

// Verbs whose actions are options, so their first argument is the subcommand.
const OPTION_ACTION_VERBS = new Set(['dpkg']);

// Patterns that are always Tier 2 (destructive / reconfiguration / sensitive target),
// even when the head verb looks safe.
const DANGER = [
  /\b(rm|rmdir|unlink|shred|srm)\b/, /\bdd\b/, /\bmkfs\b|\bmke2fs\b|\bwipefs\b|\bfdisk\b|\bparted\b|\bsgdisk\b|\bbadblocks\b/,
  /\bchmod\b|\bchown\b|\bchattr\b|\bsetfacl\b/,
  /\bchpasswd\b|\bpasswd\b|\buseradd\b|\buserdel\b|\busermod\b|\bgroupadd\b|\bgroupdel\b|\badduser\b|\bdeluser\b/,
  /\b(qm|pct)\s+(destroy|stop|shutdown|suspend|reboot|rollback|delete|set|create|clone|migrate|restore|template|mount|fstrim|resize|move-volume|pull|push)\b/,
  /\blvremove\b|\bvgremove\b|\bpvremove\b|\blvresize\b|\blvcreate\b|\bvgcreate\b|\bzfs\s+(destroy|create|set|rename|rollback|receive|snapshot)\b|\bzpool\s+(destroy|create|add|remove|replace|attach|detach)\b/,
  /\breboot\b|\bshutdown\b|\bhalt\b|\bpoweroff\b|\binit\s+[0-6]\b/,
  /\bsystemctl\s+(start|stop|restart|reload|disable|enable|mask|unmask|kill|isolate|reboot|poweroff|halt|edit|set-default)\b/,
  /\bdocker\s+(exec|run|rm|rmi|stop|start|restart|kill|create|build|push|pull|compose|cp|commit|prune|update)\b/,
  /\bdocker\s+(system|image|volume|network|container|builder)\s+prune\b/,
  /\biptables\b|\bip6tables\b|\bnft\b|\bnftables\b|\bufw\b|\bip\s+(route|addr|link)\s+(add|del|change|flush|set)\b/,
  /\bsed\s+-i|\bperl\s+-i|\btee\b|\btruncate\b|\binstall\b\s+-/,
  /\|\s*(sh|bash|zsh)\b|\b(curl|wget|fetch)\b/,
  /\b(kill|pkill|killall)\b/,
  /\b(mv|cp|ln|rsync|scp|sftp)\b/,
  /\bapt(-get)?\s+(remove|purge|autoremove|install|upgrade|dist-upgrade|update|full-upgrade)\b|\bdpkg\s+(-i|--install|-r|--remove|-P|--purge)\b/,
  /\bgit\s+(push|reset|clean|filter-repo|rebase|checkout|commit|add|rm|merge|fetch|pull)\b/,
  /\/root\/\.ssh|authorized_keys|id_ed25519|id_rsa|\.pem\b|private[\s_-]?key/i,
  /\bborg\b|borg-key/i,
  /\/etc\/pve\b|pve-cluster|corosync|\bpvecm\s+(add|delete|expected|updatecerts|qdevice)\b/,
  /\bbao\s+(operator|write|delete|put|destroy|patch|lease|policy\s+(write|delete)|token\s+(create|revoke)|kv\s+(put|delete|destroy|patch|metadata)|auth\s+(enable|disable|tune)|secrets\s+(enable|disable|tune)|audit\s+(enable|disable))\b/i,
  /unseal[_-]?key|\.key\b/i,
  /credentials\.md|\.env\b|secrets\//i,
  /\/etc\/g?shadow\b|\bgetent\s+(shadow|gshadow)\b/i,
  /\/proc\/[^/\s]*\/environ/,
  /\bfind\b[^|;&]*\s-(delete|exec|execdir|ok|okdir|fprintf?|fls)\b/,
  /\b(system|popen|execl|execv|execve|execlp|execvp|eval|spawn)\s*\(/,
];

// Strip benign redirects (/dev/null, 2>&1, &>) before checking for write redirects.
function stripBenignRedirects(cmd) {
  return cmd
    .replace(/\d*>>?\s*\/dev\/(null|stderr|stdout)/g, ' ')
    .replace(/\d*>&\d?-?/g, ' ')
    .replace(/&>\s*\/dev\/null/g, ' ');
}

// Return the subcommand (first non-option word) if it is not allowed, else undefined.
function badSubcommand(verb, allowed, rest) {
  if (OPTION_ACTION_VERBS.has(verb)) {
    const a = rest[0];
    return a === undefined || allowed.has(a) || allowed.has(a.replace(/^-+/, '')) ? undefined : a;
  }
  const a = rest.find(w => !w.startsWith('-'));
  if (a !== undefined) return allowed.has(a) ? undefined : a;
  return rest.find(w => !allowed.has(w));
}

// Split on ; | && || newline and return word lists per segment, stripping env/sudo prefixes.
function segments(cmd) {
  return cmd.split(/;|\n|\|\||&&|\||&/).map(s => s.trim()).filter(Boolean).map(seg => {
    let s = seg;
    s = s.replace(/^\s*sudo\s+(-\S+\s+)*/, '');
    s = s.replace(/^\s*(export\s+)?(\w+=("[^"]*"|'[^']*'|\S+)\s+)+/, '');
    s = s.replace(/^\s*env\s+(\w+=\S+\s+)+/, '');
    return s.trim().split(/\s+/);
  });
}

// classify(toolName, args, options) -> { tier: 1 | 2, reason: string }
// options.sensitiveCtids: Set<number> of CT IDs that are always Tier 2 (e.g. vault containers).
export function classify(toolName, args = {}, { sensitiveCtids = new Set() } = {}) {
  // 0. Vault-class CT: always Tier 2, whatever the tool
  const ctid = args.ctid ?? (/^\d+$/.test(String(args.target ?? '')) ? args.target : undefined);
  if (ctid !== undefined && sensitiveCtids.has(Number(ctid))) {
    return { tier: 2, reason: `sensitive CT (${ctid})` };
  }

  // 1. Read-only tools
  if (READONLY_TOOLS.has(toolName)) return { tier: 1, reason: 'read-only tool' };

  // 2. service_restart: Tier 1 (reversible) unless the service is sensitive
  if (toolName === 'service_restart') {
    const svc = String(args.service || '');
    if (SENSITIVE_SERVICES.test(svc)) return { tier: 2, reason: `sensitive service: ${svc}` };
    return { tier: 1, reason: 'application service restart (reversible)' };
  }

  // 3. Exec tools: classify by the command
  if (EXEC_TOOLS.has(toolName)) {
    const cmd = String(args.cmd || '');
    if (!cmd.trim()) return { tier: 2, reason: 'empty command' };

    const clean = stripBenignRedirects(cmd);

    // Command/process substitution cannot be parsed safely -> Tier 2
    if (/\$\(|`|<\(|>\(/.test(clean)) return { tier: 2, reason: 'command/process substitution ($(), `, <(), >())' };
    if (/>>?/.test(clean)) return { tier: 2, reason: 'write redirect' };

    for (const re of DANGER) {
      if (re.test(clean)) return { tier: 2, reason: 'destructive/sensitive pattern detected' };
    }

    // Deny-by-default: every segment must start with an allow-listed verb (+ safe subcommand)
    for (const words of segments(clean)) {
      const verb = (words[0] || '').replace(/^.*\//, '');
      if (!SAFE_READ.has(verb)) return { tier: 2, reason: `non-allow-listed verb: ${verb || '(empty)'}` };
      const sub = SAFE_SUBCMD[verb];
      const bad = sub && badSubcommand(verb, sub, words.slice(1));
      if (bad !== undefined) return { tier: 2, reason: `${verb} ${bad}: subcommand not in allow-list` };
    }
    return { tier: 1, reason: 'read/diagnostic command in allow-list' };
  }

  // 4. Anything unrecognized -> Tier 2 (deny-by-default)
  return { tier: 2, reason: 'unrecognized tool (deny-by-default)' };
}

export const CLASSIFIER_VERSION = '1.2.0';
