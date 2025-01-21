#!/bin/bash

# Create necessary directories
sshpass -p 'mctmLIZOWr8c' ssh root@bouazizi.dev "mkdir -p /var/www/bouazizi/webplayer/{assets,gltf,images}"

# Deploy built files
sshpass -p 'mctmLIZOWr8c' scp -r dist/* root@bouazizi.dev:/var/www/bouazizi/webplayer/

# Set proper permissions
sshpass -p 'mctmLIZOWr8c' ssh root@bouazizi.dev "chown -R www-data:www-data /var/www/bouazizi/webplayer && chmod -R 755 /var/www/bouazizi/webplayer"