import { spawn } from 'node:child_process';
export function run(command, args, { input, timeout = 120000, cwd, onLine } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env: process.env, stdio: ['pipe','pipe','pipe'], detached: process.platform !== 'win32' });
    let stdout = '', stderr = '', settled = false;
    const stop = () => { try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill('SIGTERM'); } };
    const timer = setTimeout(() => { stop(); finish(new Error('처리 시간이 초과되었습니다. 다시 시도해 주세요.')); }, timeout);
    function finish(error, value) { if (settled) return; settled = true; clearTimeout(timer); error ? reject(error) : resolve(value); }
    child.on('error', e => finish(new Error(e.code === 'ENOENT' ? `${command}을 찾을 수 없습니다. README의 설치 방법을 확인하세요.` : e.message)));
    child.stdout.on('data', chunk => { stdout += chunk; onLine?.(String(chunk)); if (stdout.length > 20000000) { stop(); finish(new Error('출력이 너무 큽니다.')); } });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-18000); });
    child.on('close', code => finish(code === 0 ? null : new Error(stderr.trim().slice(-1400) || `${command} 실행 실패 (${code})`), stdout));
    child.stdin.on('error', () => {});
    child.stdin.end(input || '');
  });
}
