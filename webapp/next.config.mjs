import os from 'os';

// Gather all local network interface IP addresses to whitelist cross-origin dev requests
const getLocalOrigins = () => {
  const interfaces = os.networkInterfaces();
  const origins = [];
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name] || []) {
      origins.push(net.address);
    }
  }

  // Add the specific IPv6 addresses from the user's Wi-Fi network adapter
  const userSpecifiedIPs = [
    '2604:3d08:b77e:6c80::36a2',
    '2604:3d08:b77e:6c80:ebb7:c3b0:bd26:211a',
    '2604:3d08:b77e:6c80:44fc:8242:2696:3b7b',
    'fe80::5834:b664:9370:e356'
  ];

  // Dynamically generate all IPs for common local home subnets (192.168.0.x and 192.168.1.x)
  // to ensure access remains unbroken even if DHCP assigns a new IP.
  const commonSubnets = [];
  for (let i = 1; i <= 254; i++) {
    commonSubnets.push(`192.168.0.${i}`);
    commonSubnets.push(`192.168.1.${i}`);
    commonSubnets.push(`10.0.0.${i}`);
  }

  return Array.from(new Set([
    ...origins,
    ...userSpecifiedIPs,
    ...commonSubnets,
    'localhost',
    '127.0.0.1',
    '::1'
  ]));
};

/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
  allowedDevOrigins: getLocalOrigins(),
  serverExternalPackages: ['mssql', 'tedious'],
};

export default nextConfig;
