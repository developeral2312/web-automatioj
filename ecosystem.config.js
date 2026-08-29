module.exports = {
    apps: [{
        name: 'whatsapp-archiver',
        script: 'app.js',
        instances: 1,
        exec_mode: 'fork',
        watch: false,
        max_memory_restart: '800M',
        env: {
            NODE_ENV: 'production',
            PUPPETEER_HEADLESS: 'true'
        },
        error_file: './logs/err.log',
        out_file: './logs/out.log',
        log_file: './logs/combined.log',
        time: true,
        autorestart: true,
        max_restarts: 10,
        min_uptime: '10s',
        kill_timeout: 5000,
        listen_timeout: 30000,
        restart_delay: 5000
    }]
};