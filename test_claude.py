#!/usr/bin/env python3
import subprocess
import sys

def test_claude():
    """Test Claude CLI directly"""
    print("Testing Claude CLI...")
    
    try:
        # Test with simple command
        cmd = ['claude', '-p', 'Hello, Claude! Please respond with a simple greeting.']
        print(f"Command: {' '.join(cmd)}")
        
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1
        )
        
        print("\n--- Output ---")
        while True:
            line = process.stdout.readline()
            if not line and process.poll() is not None:
                break
            if line:
                print(line.strip())
        
        return_code = process.poll()
        print(f"\n--- Exit Code: {return_code} ---")
        
    except FileNotFoundError:
        print("ERROR: Claude CLI not found. Please ensure it's installed and in PATH")
    except Exception as e:
        print(f"ERROR: {e}")

if __name__ == "__main__":
    test_claude()