#!/bin/bash

# Walking Coder - Server Installation Script
# Run this on your Ubuntu server after cloning the repository

echo "=== Installing Walking Coder Dependencies ==="
echo ""

# Make sure you're in the virtual environment
echo "Activating virtual environment..."
echo "source venv/bin/activate"
echo ""

# Install all required Python packages
echo "Installing Python dependencies..."
cat << 'EOF'
pip install flask
pip install flask-socketio
pip install flask-cors
pip install python-socketio
pip install eventlet
pip install python-dotenv
EOF

echo ""
echo "Or install all at once:"
echo "pip install flask flask-socketio flask-cors python-socketio eventlet python-dotenv"
echo ""

# Check if Claude CLI is installed
echo "=== Checking Claude CLI Installation ==="
echo ""
echo "Check if Claude CLI is installed:"
echo "which claude"
echo ""
echo "If not installed, install Claude CLI:"
echo "curl -fsSL https://cli.claude.ai/install.sh | sh"
echo ""
echo "Then authenticate:"
echo "claude auth"
echo ""

# Create .env file if needed
echo "=== Environment Configuration ==="
echo ""
echo "Create .env file (if needed):"
cat << 'EOF'
cat > .env << 'ENVFILE'
FLASK_APP=interactive_claude.py
FLASK_ENV=production
HOST=0.0.0.0
PORT=8080
ENVFILE
EOF
echo ""

# Run the application
echo "=== Running the Application ==="
echo ""
echo "For testing (foreground):"
echo "python interactive_claude.py"
echo ""
echo "For production (background with nohup):"
echo "nohup python interactive_claude.py > walking-coder.log 2>&1 &"
echo ""
echo "Or use screen/tmux:"
echo "screen -S walking-coder"
echo "python interactive_claude.py"
echo "# Press Ctrl+A, D to detach"
echo ""

# Systemd service setup
echo "=== Setting up as System Service (Recommended) ==="
echo ""
echo "1. Create service file:"
echo "sudo nano /etc/systemd/system/walking-coder.service"
echo ""
cat << 'EOF'
[Unit]
Description=Walking Coder Claude TUI Interface
After=network.target

[Service]
Type=simple
User=hoon
WorkingDirectory=/home/hoon/Documents/walking-coder
Environment="PATH=/home/hoon/Documents/walking-coder/venv/bin:/usr/local/bin:/usr/bin:/bin"
ExecStart=/home/hoon/Documents/walking-coder/venv/bin/python /home/hoon/Documents/walking-coder/interactive_claude.py
Restart=always
RestartSec=10
StandardOutput=append:/home/hoon/Documents/walking-coder/walking-coder.log
StandardError=append:/home/hoon/Documents/walking-coder/walking-coder-error.log

[Install]
WantedBy=multi-user.target
EOF
echo ""
echo "2. Reload systemd and start service:"
echo "sudo systemctl daemon-reload"
echo "sudo systemctl enable walking-coder"
echo "sudo systemctl start walking-coder"
echo "sudo systemctl status walking-coder"
echo ""

# Nginx reverse proxy setup (optional)
echo "=== Nginx Reverse Proxy Setup (Optional) ==="
echo ""
echo "If you want to use Nginx as reverse proxy:"
echo ""
echo "1. Install Nginx:"
echo "sudo apt install nginx"
echo ""
echo "2. Create site configuration:"
echo "sudo nano /etc/nginx/sites-available/walking-coder"
echo ""
cat << 'EOF'
server {
    listen 80;
    server_name pi.ssh00n.site;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket support
        proxy_read_timeout 86400;
    }
    
    location /socket.io {
        proxy_pass http://127.0.0.1:8080/socket.io;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF
echo ""
echo "3. Enable site and restart Nginx:"
echo "sudo ln -s /etc/nginx/sites-available/walking-coder /etc/nginx/sites-enabled/"
echo "sudo nginx -t"
echo "sudo systemctl restart nginx"
echo ""

# Firewall configuration
echo "=== Firewall Configuration ==="
echo ""
echo "Open necessary ports:"
echo "sudo ufw allow 8080/tcp  # For direct access"
echo "sudo ufw allow 80/tcp    # For Nginx"
echo "sudo ufw allow 443/tcp   # For HTTPS (if needed)"
echo "sudo ufw reload"
echo ""

# Final checks
echo "=== Final Steps ==="
echo ""
echo "1. Check if the service is running:"
echo "   curl http://localhost:8080"
echo ""
echo "2. Check logs if there are issues:"
echo "   tail -f walking-coder.log"
echo "   sudo journalctl -u walking-coder -f"
echo ""
echo "3. Access the application:"
echo "   Desktop: http://pi.ssh00n.site:8080"
echo "   Mobile: http://pi.ssh00n.site:8080/mobile"
echo ""
echo "4. If using port 7681 instead of 8080, update all configurations above"
echo "   and replace 8080 with 7681"