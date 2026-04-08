const { spawn } = require('child_process');
const child = spawn('node', ['-e', 'setInterval(() => { console.log("child ppid", process.ppid) }, 500)'], { stdio: 'inherit' });
child.unref();
setTimeout(() => { console.log('parent dying'); process.exit(0); }, 1000);
