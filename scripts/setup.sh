#!/bin/bash

# System Administrator Setup Script
# Author: 50bvd
# Purpose: Automated system configuration and monitoring setup

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== System Administrator Setup Script ===${NC}"

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}This script must be run as root${NC}"
   exit 1
fi

echo -e "${YELLOW}[*] Starting system configuration...${NC}"

# Update package manager
echo -e "${YELLOW}[*] Updating package manager...${NC}"
apt-get update -qq
apt-get upgrade -y -qq

# Install Docker
echo -e "${YELLOW}[*] Checking Docker installation...${NC}"
if ! command -v docker &> /dev/null; then
    echo -e "${YELLOW}[*] Installing Docker...${NC}"
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
else
    echo -e "${GREEN}[✓] Docker is already installed${NC}"
fi

# Install essential tools
echo -e "${YELLOW}[*] Installing essential tools...${NC}"
apt-get install -y -qq \
    curl \
    wget \
    git \
    htop \
    net-tools \
    vim

echo -e "${GREEN}[✓] Setup completed successfully!${NC}"
