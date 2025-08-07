# Apache Setup Instructions for GPT Adventure

## Prerequisites

Ensure Apache and required modules are installed:

```bash
sudo apt update
sudo apt install apache2

# Enable required modules
sudo a2enmod proxy
sudo a2enmod proxy_http
sudo a2enmod proxy_wstunnel
sudo a2enmod headers
sudo a2enmod ssl
sudo a2enmod rewrite
```

## Installation Steps

1. **Copy the configuration file:**
   ```bash
   sudo cp gpt-adventure.conf /etc/apache2/sites-available/
   ```

2. **Edit the configuration:**
   ```bash
   sudo nano /etc/apache2/sites-available/gpt-adventure.conf
   ```
   
   Update these values:
   - Replace `yourdomain.com` with your actual domain
   - Update SSL certificate paths (if using HTTPS)

3. **Enable the site:**
   ```bash
   sudo a2ensite gpt-adventure.conf
   ```

4. **Disable default site (optional):**
   ```bash
   sudo a2dissite 000-default.conf
   ```

5. **Test configuration:**
   ```bash
   sudo apache2ctl configtest
   ```

6. **Restart Apache:**
   ```bash
   sudo systemctl restart apache2
   ```

## SSL Setup (Optional but Recommended)

### Using Let's Encrypt (Certbot):

1. **Install Certbot:**
   ```bash
   sudo apt install certbot python3-certbot-apache
   ```

2. **Obtain SSL certificate:**
   ```bash
   sudo certbot --apache -d yourdomain.com -d www.yourdomain.com
   ```

3. **Auto-renewal setup:**
   ```bash
   sudo crontab -e
   # Add this line:
   0 12 * * * /usr/bin/certbot renew --quiet
   ```

## Firewall Configuration

```bash
sudo ufw allow 'Apache Full'
sudo ufw allow 22/tcp  # SSH
sudo ufw enable
```

## Node.js Service Configuration

Create a systemd service to keep your Node.js app running:

```bash
sudo nano /etc/systemd/system/gpt-adventure.service
```

Add this content:
```ini
[Unit]
Description=GPT Adventure Node.js App
After=network.target

[Service]
Type=simple
User=keith
WorkingDirectory=/home/keith/github/gpt_adventure
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
```

Enable the service:
```bash
sudo systemctl daemon-reload
sudo systemctl enable gpt-adventure
sudo systemctl start gpt-adventure
sudo systemctl status gpt-adventure
```

## Troubleshooting

1. **Check Apache status:**
   ```bash
   sudo systemctl status apache2
   ```

2. **Check Apache logs:**
   ```bash
   sudo tail -f /var/log/apache2/gpt-adventure-error.log
   sudo tail -f /var/log/apache2/gpt-adventure-access.log
   ```

3. **Check Node.js app:**
   ```bash
   sudo systemctl status gpt-adventure
   sudo journalctl -u gpt-adventure -f
   ```

4. **Test proxy connection:**
   ```bash
   curl -I http://localhost:3000
   curl -I http://yourdomain.com
   ```

## Security Notes

- The configuration includes security headers
- SSL is strongly recommended for production
- Consider implementing rate limiting at the Apache level
- Regularly update Apache and Node.js
- Monitor logs for suspicious activity