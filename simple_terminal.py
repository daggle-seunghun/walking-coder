from flask import Flask, render_template, jsonify, request
from flask_socketio import SocketIO, emit, join_room
from flask_cors import CORS
import subprocess
import os
import threading
import queue
import time

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-secret-key-terminal')
CORS(app, origins="*")
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

# Store active sessions
sessions = {}

class ClaudeSession:
    def __init__(self, session_id, project_path=None):
        self.session_id = session_id
        self.project_path = project_path or os.path.expanduser("~/projects")
        self.process = None
        self.output_queue = queue.Queue()
        self.input_queue = queue.Queue()
        self.running = False
        
    def start(self):
        """Start Claude in interactive mode"""
        self.running = True
        
        # Ensure project directory exists
        if not os.path.exists(self.project_path):
            os.makedirs(self.project_path, exist_ok=True)
        
        print(f"Starting Claude in directory: {self.project_path}")
        
        # Start Claude process
        try:
            self.process = subprocess.Popen(
                ['claude'],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=0,
                cwd=self.project_path,
                env={**os.environ, 'TERM': 'xterm-256color'}
            )
            print(f"Claude process started with PID: {self.process.pid}")
        except Exception as e:
            print(f"Failed to start Claude: {e}")
            raise
        
        # Start output reader thread
        threading.Thread(target=self._read_output, daemon=True).start()
        
        # Start input writer thread
        threading.Thread(target=self._write_input, daemon=True).start()
        
    def _read_output(self):
        """Read output from Claude and send to client"""
        print(f"Output reader thread started for session {self.session_id}")
        while self.running and self.process:
            try:
                line = self.process.stdout.readline()
                if line:
                    print(f"Claude output: {line.strip()}")
                    socketio.emit('terminal_output', {
                        'data': line
                    }, room=self.session_id)
                elif self.process.poll() is not None:
                    print(f"Claude process ended with code: {self.process.poll()}")
                    break
            except Exception as e:
                print(f"Error reading output: {e}")
                break
        self.stop()
    
    def _write_input(self):
        """Write input to Claude from queue"""
        print(f"Input writer thread started for session {self.session_id}")
        while self.running and self.process:
            try:
                data = self.input_queue.get(timeout=0.1)
                if data and self.process.stdin:
                    print(f"Sending to Claude: {data.strip()}")
                    self.process.stdin.write(data)
                    self.process.stdin.flush()
            except queue.Empty:
                continue
            except Exception as e:
                print(f"Error writing input: {e}")
                break
    
    def send_input(self, data):
        """Queue input to be sent to Claude"""
        if self.running:
            self.input_queue.put(data)
    
    def stop(self):
        """Stop the session"""
        self.running = False
        if self.process:
            try:
                self.process.terminate()
                time.sleep(0.5)
                if self.process.poll() is None:
                    self.process.kill()
            except:
                pass

@app.route('/')
def index():
    return render_template('simple_terminal.html')

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
    """Start a new Claude session"""
    session_id = request.sid
    project_path = data.get('project_path', '~/projects')
    
    # Expand path
    project_path = os.path.expanduser(project_path)
    
    if session_id not in sessions:
        try:
            session = ClaudeSession(session_id, project_path)
            sessions[session_id] = session
            session.start()
            emit('terminal_ready', {'message': 'Claude session started'})
        except Exception as e:
            emit('terminal_error', {'message': str(e)})

@socketio.on('terminal_input')
def handle_terminal_input(data):
    """Handle input from client"""
    session_id = request.sid
    if session_id in sessions:
        sessions[session_id].send_input(data['input'])

@socketio.on('stop_terminal')
def handle_stop_terminal():
    """Stop Claude session"""
    session_id = request.sid
    if session_id in sessions:
        sessions[session_id].stop()
        del sessions[session_id]
        emit('terminal_stopped', {'message': 'Session stopped'})

if __name__ == '__main__':
    import sys
    port = int(os.environ.get('PORT', 8080))
    print(f"Starting Simple Claude Terminal on port {port}")
    socketio.run(app, host='0.0.0.0', port=port, debug=True, allow_unsafe_werkzeug=True)