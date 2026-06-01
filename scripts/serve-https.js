/**
 * HTTPS dev server launcher for DROP_web
 * 
 * Usage:
 *   1. Install mkcert: https://github.com/FiloSottile/mkcert
 *   2. npm install -D local-ssl-proxy
 *   3. node scripts/serve-https.js
 * 
 * Or simply use ngrok:
 *   1. Install ngrok: https://ngrok.com/download
 *   2. ngrok http 3000
 *   3. Open the ngrok HTTPS URL on your phone
 */

const { execSync } = require('child_process');
const os = require('os');

function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return '127.0.0.1';
}

console.log('');
console.log('=== DROP Web - HTTPS Dev Server ===');
console.log('');
console.log('To test on your phone via HTTPS:');
console.log('');
console.log('Option 1 - ngrok (easiest):');
console.log('  npm install -g ngrok');
console.log('  ngrok http 3000');
console.log('  Then open the ngrok URL on your phone.');
console.log('');
console.log('Option 2 - mkcert + local-ssl-proxy:');
console.log('  # Install mkcert: https://github.com/FiloSottile/mkcert');
console.log('  npm install -D local-ssl-proxy');
console.log('  npx local-ssl-proxy --source 3443 --target 3000 --cert localhost.pem --key localhost-key.pem');
console.log('  Then open https://YOUR_LOCAL_IP:3443 on your phone.');
console.log('');
console.log(`Your local IP is: ${getLocalIP()}`);
console.log('');
console.log('Run "npm run dev" in another terminal first.');