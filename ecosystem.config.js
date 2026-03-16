module.exports = {
  apps: [
    {
      name: "syndcal-api",
      cwd: "C:/Users/Administrator/.openclaw/workspace/projects/syndcal/apps/api",
      script: "dist/index.js",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env_production: {
        NODE_ENV: "production",
        PORT: "3001",
      },
    },
    {
      name: "syndcal-web",
      cwd: "C:/Users/Administrator/.openclaw/workspace/projects/syndcal/apps/web",
      script: "dist/server/entry.mjs",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env_production: {
        NODE_ENV: "production",
        PORT: "4321",
        HOST: "0.0.0.0",
        PUBLIC_API_BASE: "https://syndcal.kvtechnology.io",
      },
    },
  ],
};
