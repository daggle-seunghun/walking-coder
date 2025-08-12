#!/usr/bin/env python3
import os
import pty
import subprocess
import select
import termios
import struct
import fcntl
import signal
from flask import Flask, render_template, jsonify, request
from flask_socketio import SocketIO, emit, join_room, leave_room
from flask_cors import CORS
from threading import Thread
import time

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-secret-key-interactive')
CORS(app, origins="*")
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

# Store active sessions
sessions = {}

class InteractiveClaudeSession:
    def __init__(self, session_id, project_path=None):
        self.session_id = session_id
        self.project_path = project_path or os.path.expanduser("~/projects")
        self.master_fd = None
        self.slave_fd = None
        self.pid = None
        self.running = False
        
        # Ensure project directory exists
        if not os.path.exists(self.project_path):
            os.makedirs(self.project_path, exist_ok=True)
    
    def start(self):
        """Start Claude in interactive mode using PTY"""
        try:
            # Create a pseudo-terminal pair
            self.master_fd, self.slave_fd = pty.openpty()
            
            # Set terminal attributes for proper interactive mode
            attrs = termios.tcgetattr(self.master_fd)
            # Enable raw mode for better control character handling
            attrs[3] = attrs[3] & ~termios.ECHO  # Disable echo
            termios.tcsetattr(self.master_fd, termios.TCSANOW, attrs)
            
            # Fork the process
            self.pid = os.fork()
            
            if self.pid == 0:  # Child process
                # Set up the slave side of the PTY
                os.close(self.master_fd)
                
                # Make the slave PTY the controlling terminal
                os.setsid()
                os.dup2(self.slave_fd, 0)  # stdin
                os.dup2(self.slave_fd, 1)  # stdout
                os.dup2(self.slave_fd, 2)  # stderr
                
                if self.slave_fd > 2:
                    os.close(self.slave_fd)
                
                # Set terminal attributes
                os.environ['TERM'] = 'xterm-256color'
                os.environ['COLORTERM'] = 'truecolor'
                os.environ['COLUMNS'] = '80'
                os.environ['LINES'] = '24'
                
                # Change to project directory
                os.chdir(self.project_path)
                
                # Execute Claude (it starts in interactive mode by default)
                os.execvp('claude', ['claude'])
                
            else:  # Parent process
                os.close(self.slave_fd)
                self.running = True
                
                # Make the master FD non-blocking
                flags = fcntl.fcntl(self.master_fd, fcntl.F_GETFL)
                fcntl.fcntl(self.master_fd, fcntl.F_SETFL, flags | os.O_NONBLOCK)
                
                # Set initial terminal size
                self.resize(24, 80)
                
                print(f"Started Claude interactive session with PID {self.pid}")
                
                # Start output reader thread
                Thread(target=self._read_output, daemon=True).start()
                
        except Exception as e:
            print(f"Error starting Claude: {e}")
            self.stop()
            raise
    
    def _read_output(self):
        """Read output from Claude and send to client"""
        buffer = ""
        while self.running:
            try:
                # Use select to wait for data
                readable, _, _ = select.select([self.master_fd], [], [], 0.1)
                
                if readable:
                    data = os.read(self.master_fd, 4096)
                    if data:
                        output = data.decode('utf-8', errors='replace')
                        buffer += output
                        
                        # Send output to client
                        socketio.emit('output', {
                            'data': output
                        }, room=self.session_id)
                        
                        # Debug log
                        for line in output.split('\n'):
                            if line.strip():
                                print(f"[Claude Output] {line[:100]}")
                    else:
                        print("No data received, Claude may have exited")
                        break
                        
            except OSError as e:
                if e.errno == 5:  # Input/output error
                    print("PTY closed")
                    break
            except Exception as e:
                print(f"Error reading output: {e}")
                break
        
        self.stop()
    
    def send_input(self, data):
        """Send input to Claude"""
        if self.running and self.master_fd:
            try:
                # Send raw bytes directly without modification
                # This preserves control characters and special keys
                if isinstance(data, str):
                    data = data.encode('utf-8')
                os.write(self.master_fd, data)
                
                # Debug log for printable characters only
                try:
                    printable = data.decode('utf-8', errors='ignore')
                    if printable.isprintable() or printable == '\n':
                        print(f"[User Input] {repr(printable)}")
                except:
                    pass
            except Exception as e:
                print(f"Error sending input: {e}")
    
    def resize(self, rows, cols):
        """Resize the PTY window"""
        if self.master_fd:
            try:
                winsize = struct.pack("HHHH", rows, cols, 0, 0)
                fcntl.ioctl(self.master_fd, termios.TIOCSWINSZ, winsize)
            except Exception as e:
                print(f"Error resizing terminal: {e}")
    
    def stop(self):
        """Stop the Claude session"""
        self.running = False
        
        if self.master_fd:
            try:
                os.close(self.master_fd)
            except:
                pass
        
        if self.pid:
            try:
                os.kill(self.pid, signal.SIGTERM)
                time.sleep(0.5)
                # Force kill if still running
                os.kill(self.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            except Exception as e:
                print(f"Error stopping process: {e}")

@app.route('/')
def index():
    # Check if mobile device
    user_agent = request.headers.get('User-Agent', '').lower()
    is_mobile = any(device in user_agent for device in ['mobile', 'android', 'iphone', 'ipad'])
    
    if is_mobile:
        return render_template('mobile_terminal.html')
    else:
        return render_template('interactive.html')

@app.route('/mobile')
def mobile():
    return render_template('mobile_terminal.html')

@app.route('/health')
def health():
    return jsonify({
        'status': 'healthy',
        'active_sessions': len(sessions)
    })

@socketio.on('connect')
def handle_connect():
    session_id = request.sid
    print(f"Client connected: {session_id}")
    join_room(session_id)
    emit('connected', {'session_id': session_id})

@socketio.on('disconnect')
def handle_disconnect():
    session_id = request.sid
    print(f"Client disconnected: {session_id}")
    
    if session_id in sessions:
        sessions[session_id].stop()
        del sessions[session_id]
    
    leave_room(session_id)

@socketio.on('start_session')
def handle_start_session(data):
    session_id = request.sid
    project_path = data.get('project_path', '~/projects')
    
    if session_id in sessions:
        emit('error', {'message': 'Session already active'})
        return
    
    try:
        session = InteractiveClaudeSession(session_id, project_path)
        sessions[session_id] = session
        session.start()
        emit('session_started', {'message': 'Claude interactive session started'})
    except Exception as e:
        emit('error', {'message': f'Failed to start session: {str(e)}'})

@socketio.on('input')
def handle_input(data):
    session_id = request.sid
    
    if session_id not in sessions:
        emit('error', {'message': 'No active session'})
        return
    
    sessions[session_id].send_input(data['input'])

@socketio.on('resize')
def handle_resize(data):
    session_id = request.sid
    
    if session_id in sessions:
        sessions[session_id].resize(data['rows'], data['cols'])

@socketio.on('stop_session')
def handle_stop_session():
    session_id = request.sid
    
    if session_id in sessions:
        sessions[session_id].stop()
        del sessions[session_id]
        emit('session_stopped', {'message': 'Session stopped'})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 7681))
    print(f"Starting Interactive Claude on port {port}")
    socketio.run(app, host='0.0.0.0', port=port, debug=True, allow_unsafe_werkzeug=True)