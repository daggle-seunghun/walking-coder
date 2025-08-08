from flask import Flask, render_template, jsonify, request
from flask_socketio import SocketIO, emit, join_room
from flask_cors import CORS
import subprocess
import os
import threading
import queue

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-secret-key-chat')
CORS(app, origins="*")
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

# Store active sessions
sessions = {}

class ClaudeChatSession:
    def __init__(self, session_id, project_path=None):
        self.session_id = session_id
        self.project_path = project_path or os.path.expanduser("~/projects")
        self.conversation_history = []
        
        # Ensure project directory exists
        if not os.path.exists(self.project_path):
            os.makedirs(self.project_path, exist_ok=True)
    
    def send_message(self, message):
        """Send a message to Claude using -m flag"""
        self.conversation_history.append({'role': 'user', 'content': message})
        
        # Execute Claude with message
        try:
            print(f"Sending to Claude: {message}")
            
            result = subprocess.run(
                ['claude', '-m', message],
                capture_output=True,
                text=True,
                cwd=self.project_path,
                timeout=60
            )
            
            response = result.stdout
            if not response and result.stderr:
                response = f"Error: {result.stderr}"
            
            print(f"Claude response: {response[:200]}...")  # Log first 200 chars
            
            self.conversation_history.append({'role': 'assistant', 'content': response})
            return response
            
        except subprocess.TimeoutExpired:
            return "Request timed out after 60 seconds."
        except Exception as e:
            print(f"Error executing Claude: {e}")
            return f"Error: {str(e)}"

@app.route('/')
def index():
    return render_template('claude_chat.html')

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
    
    # Create session
    sessions[request.sid] = ClaudeChatSession(request.sid)
    emit('ready', {'message': 'Claude chat session ready'})

@socketio.on('disconnect')
def handle_disconnect():
    print(f"Client disconnected: {request.sid}")
    if request.sid in sessions:
        del sessions[request.sid]

@socketio.on('send_message')
def handle_message(data):
    """Handle message from client"""
    session_id = request.sid
    message = data.get('message', '')
    
    if session_id not in sessions:
        sessions[session_id] = ClaudeChatSession(session_id)
    
    print(f"Processing message from {session_id}: {message}")
    
    # Send message to Claude in a thread to avoid blocking
    def process_message():
        emit('status', {'message': 'Processing...'}, room=session_id)
        response = sessions[session_id].send_message(message)
        emit('response', {'message': response}, room=session_id)
    
    threading.Thread(target=process_message).start()

@socketio.on('set_project')
def handle_set_project(data):
    """Set project path for the session"""
    session_id = request.sid
    project_path = os.path.expanduser(data.get('path', '~/projects'))
    
    if session_id in sessions:
        sessions[session_id].project_path = project_path
        if not os.path.exists(project_path):
            os.makedirs(project_path, exist_ok=True)
        emit('project_set', {'path': project_path})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    print(f"Starting Claude Chat Interface on port {port}")
    socketio.run(app, host='0.0.0.0', port=port, debug=True, allow_unsafe_werkzeug=True)