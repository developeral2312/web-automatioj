#!/bin/bash

echo "🚀 Deploying WhatsApp Bot..."
echo "================================"

# Pull latest code
echo "📥 Pulling latest code..."
git pull

# Install dependencies
echo "📦 Installing dependencies..."
npm install --production

# Create logs folder
mkdir -p logs

# Restart PM2
echo "🔄 Restarting PM2..."
pm2 restart ecosystem.config.js

echo ""
echo "✅ Deployment completed!"
echo "================================"
pm2 status
pm2 logs whatsapp-bot --lines 20