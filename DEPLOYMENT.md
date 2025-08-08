# 🚀 Claude Mobile Interface - Docker Deployment Guide

## Prerequisites

- Docker & Docker Compose
- Python 3.11+
- `uv` package manager
- Claude CLI installed on the server

## 🏠 Local Development

```bash
# Install dependencies
uv pip install -r pyproject.toml

# Run development server
uv run python app.py

# Or with gunicorn
uv run gunicorn --worker-class eventlet -w 1 --bind 0.0.0.0:8080 app:app
```

Access at: http://localhost:8080

## 🐳 Docker Deployment

### Quick Start

```bash
# Build and run with docker-compose
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Production Deployment

```bash
# Use the deploy script
./deploy.sh production

# Or manually
docker build -t claude-mobile:latest .
docker run -d -p 8080:8080 --name claude-mobile claude-mobile:latest
```

### Custom Port Deployment

```bash
# Run on custom port (e.g., 7681)
docker run -d -p 7681:8080 --name claude-mobile claude-mobile:latest

# Or modify docker-compose.yml ports section
# ports:
#   - "7681:8080"
```

## 🔧 Environment Variables

Create a `.env` file with:

```env
PORT=8080
SECRET_KEY=your-secret-key-here
FLASK_ENV=production
FLASK_DEBUG=False

# Optional: Claude API settings if needed
CLAUDE_API_KEY=your-api-key
```

## 🔒 SSL/HTTPS Setup

### Using Let's Encrypt with Nginx

```bash
# Install certbot
sudo apt-get install certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal
sudo certbot renew --dry-run
```

### Using Cloudflare

1. Add your domain to Cloudflare
2. Update DNS settings
3. Enable "Full (strict)" SSL mode
4. Use Cloudflare's Origin Certificate

## 📱 Mobile-Specific Considerations

### iOS Home Screen App

The app includes PWA support. Users can:
1. Open in Safari
2. Tap Share button
3. Select "Add to Home Screen"

### Performance Optimization

```nginx
# Add to nginx.conf for better mobile performance
location /static/ {
    expires 30d;
    add_header Cache-Control "public, immutable";
    
    # Gzip static files
    gzip_static on;
}
```

## 🔍 Health Checks & Monitoring

The app includes a `/health` endpoint for monitoring:

```bash
# Check health
curl http://your-domain.com/health

# Response
{"status": "healthy", "timestamp": "2025-01-08T10:00:00"}
```

### Uptime Monitoring Services

- UptimeRobot: Free monitoring up to 50 monitors
- Pingdom: Advanced monitoring with alerts
- New Relic: Application performance monitoring

## 🐛 Troubleshooting

### WebSocket Issues

If WebSocket connections fail:

1. Check nginx configuration includes WebSocket headers
2. Ensure firewall allows WebSocket traffic
3. Verify SSL certificates are valid

### iOS Specific Issues

1. **Zoom on input focus**: Ensure font-size is 16px minimum
2. **Safe area issues**: Check viewport-fit=cover is set
3. **PWA not installing**: Verify manifest.json and icons

### Docker Issues

```bash
# View logs
docker-compose logs -f claude-mobile

# Restart services
docker-compose restart

# Rebuild after changes
docker-compose build --no-cache
docker-compose up -d
```

## 📊 Performance Testing

```bash
# Load testing with Apache Bench
ab -n 1000 -c 10 http://localhost:8080/

# WebSocket testing
npm install -g wscat
wscat -c ws://localhost:8080/socket.io/
```

## 🔄 CI/CD Setup

### GitHub Actions

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      
      - name: Deploy to server
        uses: appleboy/ssh-action@master
        with:
          host: ${{ secrets.HOST }}
          username: ${{ secrets.USERNAME }}
          key: ${{ secrets.SSH_KEY }}
          script: |
            cd /app/claude-mobile
            git pull
            docker-compose build
            docker-compose up -d
```

## 📝 Deployment Checklist

- [ ] Set production environment variables
- [ ] Configure SSL certificates
- [ ] Set up monitoring/health checks
- [ ] Test WebSocket connections
- [ ] Verify mobile responsiveness
- [ ] Configure backup strategy
- [ ] Set up logging aggregation
- [ ] Test PWA installation
- [ ] Performance testing
- [ ] Security headers configured

## 🆘 Support

For deployment issues:
1. Check logs: `docker-compose logs`
2. Verify health endpoint: `/health`
3. Test WebSocket: Browser DevTools > Network > WS
4. Create issue on GitHub repository