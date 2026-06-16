# Multi-purpose System Administration Docker Image
# Author: 50bvd
# Purpose: Lightweight container for system administration tasks

FROM ubuntu:22.04

LABEL maintainer="50bvd"
LABEL description="System Administrator Docker Image"
LABEL version="1.0"

# Set environment variables
ENV DEBIAN_FRONTEND=noninteractive
ENV LANG=en_US.UTF-8

# Update and install essential packages
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    git \
    vim \
    htop \
    net-tools \
    iputils-ping \
    dnsutils \
    telnet \
    python3 \
    python3-pip \
    openssh-client \
    && rm -rf /var/lib/apt/lists/*

# Install Python monitoring libraries
RUN pip3 install --no-cache-dir \
    psutil \
    docker \
    requests

# Create working directory
WORKDIR /workspace

# Create a non-root user
RUN useradd -m -s /bin/bash admin && \
    usermod -aG sudo admin

# Switch to non-root user
USER admin

# Default command
CMD ["/bin/bash"]
