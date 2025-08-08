from flask import Flask, render_template, jsonify, request
from flask_socketio import SocketIO, emit, join_room
from flask_cors import CORS
import pty
import os
import subprocess
import select
import termios
import struct
import fcntl
import signal
from threading import Thread
import json

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-secret-key-terminal')
CORS(app, origins="*")
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

# Store active terminal sessions
sessions = {}

class TerminalSession:
    def __init__(self, session_id, project_path=None):
        self.session_id = session_id
        self.project_path = project_path or os.path.expanduser("~/projects")
        self.fd = None
        self.child_pid = None
        self.running = False
        
    def start(self):
        """Start a new PTY session running Claude"""
        # Create pseudo-terminal
        self.child_pid, self.fd = pty.fork()
        
        if self.child_pid == 0:
            # Child process - run Claude
            os.chdir(self.project_path)
            os.environ['TERM'] = 'xterm-256color'
            os.environ['COLORTERM'] = 'truecolor'
            
            # Execute Claude in interactive mode
            os.execvp('claude', ['claude'])
        else:
            # Parent process
            self.running = True
            # Make the PTY non-blocking
            flags = fcntl.fcntl(self.fd, fcntl.F_GETFL)
            fcntl.fcntl(self.fd, fcntl.F_SETFL, flags | os.O_NONBLOCK)
            
            # Start reading thread
            Thread(target=self._read_output, daemon=True).start()
    
    def _read_output(self):
        """Read output from PTY and send to client"""
        while self.running:
            try:
                r, _, _ = select.select([self.fd], [], [], 0.1)
                if r:
                    output = os.read(self.fd, 4096)
                    if output:
                        # Send raw terminal output to client
                        socketio.emit('terminal_output', {
                            'data': output.decode('utf-8', errors='replace')
                        }, room=self.session_id)
            except OSError:
                break
        self.stop()
    
    def write(self, data):
        """Write data to PTY"""
        if self.fd and self.running:
            try:
                os.write(self.fd, data.encode())
            except OSError:
                self.stop()
    
    def resize(self, rows, cols):
        """Resize PTY window"""
        if self.fd and self.running:
            try:
                winsize = struct.pack("HHHH", rows, cols, 0, 0)
                fcntl.ioctl(self.fd, termios.TIOCSWINSZ, winsize)
            except:
                pass
    
    def stop(self):
        """Stop the terminal session"""
        self.running = False
        if self.fd:
            try:
                os.close(self.fd)
            except:
                pass
        if self.child_pid:
            try:
                os.kill(self.child_pid, signal.SIGTERM)
            except:
                pass

@app.route('/')
def index():
    return render_template('terminal.html')

@app.route('/health')
def health():
    return jsonify({
        'status': 'healthy',
        'active_sessions': len(sessions)
    })

@socketio.on('connect')
def handle_connect():
    print(f"Client connected: {request.sid}")
    join_room(request.sid)
    emit('connected', {'session_id': request.sid})

@socketio.on('disconnect')
def handle_disconnect():
    print(f"Client disconnected: {request.sid}")
    if request.sid in sessions:
        sessions[request.sid].stop()
        del sessions[request.sid]

@socketio.on('start_terminal')
def handle_start_terminal(data):
    """Start a new terminal session"""
    session_id = request.sid
    project_path = data.get('project_path')
    
    if session_id not in sessions:
        # Create new terminal session
        session = TerminalSession(session_id, project_path)
        sessions[session_id] = session
        
        try:
            session.start()
            emit('terminal_ready', {'message': 'Terminal started'})
        except Exception as e:
            emit('terminal_error', {'message': str(e)})
            if session_id in sessions:
                del sessions[session_id]

@socketio.on('terminal_input')
def handle_terminal_input(data):
    """Handle input from client terminal"""
    session_id = request.sid
    if session_id in sessions:
        sessions[session_id].write(data['input'])

@socketio.on('terminal_resize')
def handle_terminal_resize(data):
    """Handle terminal resize"""
    session_id = request.sid
    if session_id in sessions:
        sessions[session_id].resize(data['rows'], data['cols'])

@socketio.on('stop_terminal')
def handle_stop_terminal():
    """Stop terminal session"""
    session_id = request.sid
    if session_id in sessions:
        sessions[session_id].stop()
        del sessions[session_id]
        emit('terminal_stopped', {'message': 'Terminal stopped'})

if __name__ == '__main__':
    import sys
    port = int(os.environ.get('TERMINAL_PORT', 8081))
    print(f"Starting Claude Terminal Interface on port {port}")
    socketio.run(app, host='0.0.0.0', port=port, debug=True, allow_unsafe_werkzeug=True)