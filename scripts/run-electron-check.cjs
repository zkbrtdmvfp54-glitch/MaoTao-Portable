const { spawn } = require('node:child_process');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const name = process.argv[2];
if (!['prototype-check', 'shell-check', 'audio-check', 'external-check'].includes(name)) throw new Error('Select prototype-check, shell-check, audio-check or external-check');
const profile = process.env.MAOTAO_DEV_PROFILE || fs.mkdtempSync(path.join(os.tmpdir(), 'maotao-test-'));
const runner = spawn(require('electron'), [path.join(__dirname, name + '.cjs')], {
  stdio: 'inherit',
  env: { ...process.env, MAOTAO_DEV_PROFILE: profile }
});
runner.on('exit', code => { process.exitCode = code ?? 1; });



