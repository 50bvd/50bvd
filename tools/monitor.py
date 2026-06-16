#!/usr/bin/env python3

"""
System Monitoring Tool
Author: 50bvd
Purpose: Monitor system resources and Docker containers

This tool provides real-time monitoring of:
- CPU usage
- Memory usage
- Disk usage
- Docker container status
"""

import os
import psutil
import subprocess
from datetime import datetime
from typing import Dict, List


class SystemMonitor:
    """Main system monitoring class"""

    def __init__(self):
        """Initialize the system monitor"""
        self.hostname = os.uname().nodename
        self.timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    def get_cpu_usage(self) -> float:
        """Get current CPU usage percentage"""
        return psutil.cpu_percent(interval=1)

    def get_memory_usage(self) -> Dict[str, float]:
        """Get memory usage statistics"""
        memory = psutil.virtual_memory()
        return {
            "total_gb": memory.total / (1024 ** 3),
            "used_gb": memory.used / (1024 ** 3),
            "percent": memory.percent,
        }

    def get_disk_usage(self) -> Dict[str, float]:
        """Get disk usage statistics"""
        disk = psutil.disk_usage("/")
        return {
            "total_gb": disk.total / (1024 ** 3),
            "used_gb": disk.used / (1024 ** 3),
            "percent": disk.percent,
        }

    def get_docker_containers(self) -> List[Dict]:
        """Get Docker container status"""
        try:
            result = subprocess.run(
                ["docker", "ps", "-a", "--format", "{{.Names}}\t{{.Status}}"],
                capture_output=True,
                text=True,
                timeout=5,
            )
            containers = []
            for line in result.stdout.strip().split("\n"):
                if line:
                    name, status = line.split("\t")
                    containers.append({"name": name, "status": status})
            return containers
        except Exception as e:
            return [{"error": str(e)}]

    def print_report(self) -> None:
        """Print monitoring report"""
        print(f"\n{'='*60}")
        print(f"System Monitor Report - {self.hostname}")
        print(f"Timestamp: {self.timestamp}")
        print(f"{'='*60}\n")

        # CPU
        cpu = self.get_cpu_usage()
        print(f"CPU Usage: {cpu}%")

        # Memory
        mem = self.get_memory_usage()
        print(f"\nMemory Usage:")
        print(f"  Total: {mem['total_gb']:.2f} GB")
        print(f"  Used: {mem['used_gb']:.2f} GB ({mem['percent']:.1f}%)")

        # Disk
        disk = self.get_disk_usage()
        print(f"\nDisk Usage:")
        print(f"  Total: {disk['total_gb']:.2f} GB")
        print(f"  Used: {disk['used_gb']:.2f} GB ({disk['percent']:.1f}%)")

        # Docker
        print(f"\nDocker Containers:")
        containers = self.get_docker_containers()
        for container in containers:
            if "error" in container:
                print(f"  Error: {container['error']}")
            else:
                print(f"  {container['name']}: {container['status']}")

        print(f"\n{'='*60}\n")


def main():
    """Main entry point"""
    monitor = SystemMonitor()
    monitor.print_report()


if __name__ == "__main__":
    main()
