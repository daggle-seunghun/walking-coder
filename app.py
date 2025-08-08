from flask import Flask, render_template, request, jsonify, send_file
from flask_socketio import SocketIO, emit, join_room
from flask_cors import CORS
import subprocess
import json
import os
import sys
import threading
import queue
import base64
import tempfile
import shutil
from datetime import datetime
from dotenv import load_dotenv
from werkzeug.utils import secure_filename
import asyncio
from concurrent.futures import ThreadPoolExecutor
from projects import ProjectManager

load_dotenv()

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-secret-key-change-in-production')
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size
CORS(app, origins="*")
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading', ping_timeout=300, ping_interval=60)

# Global storage
command_history = []
active_processes = {}
command_queues = {}
executor = ThreadPoolExecutor(max_workers=5)
project_manager = ProjectManager()

# File upload directory
UPLOAD_FOLDER = tempfile.mkdtemp(prefix='claude_mobile_')
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

@app.route('/')
def index():
    return render_template('project-manager.html')

@app.route('/simple')
def simple_interface():
    return render_template('mobile-claude.html')

@app.route('/health')
def health():
    return jsonify({
        'status': 'healthy', 
        'timestamp': datetime.now().isoformat(),
        'active_sessions': len(active_processes),
        'upload_dir': UPLOAD_FOLDER
    })

@socketio.on('connect')
def handle_connect():
    print(f"Client connected: {request.sid}")
    emit('connected', {'message': 'Connected to Claude Mobile Interface', 'session_id': request.sid})
    # Initialize queue for this session
    command_queues[request.sid] = queue.Queue()
    # Join the session to its own room for targeted messaging
    join_room(request.sid)

@socketio.on('disconnect')
def handle_disconnect():
    print(f"Client disconnected: {request.sid}")
    # Clean up session resources
    if request.sid in active_processes:
        try:
            active_processes[request.sid].terminate()
        except:
            pass
        del active_processes[request.sid]
    if request.sid in command_queues:
        del command_queues[request.sid]

@socketio.on('command')
def handle_command(data):
    session_id = request.sid
    command = data.get('message', '')
    files = data.get('files', [])
    project_path = data.get('project_path', None)
    
    print(f"Session {session_id}: Executing command: {command}")
    
    # Handle file uploads if present
    uploaded_files = []
    if files:
        for file_data in files:
            try:
                file_content = base64.b64decode(file_data['content'].split(',')[1])
                filename = secure_filename(file_data['name'])
                filepath = os.path.join(UPLOAD_FOLDER, f"{session_id}_{filename}")
                with open(filepath, 'wb') as f:
                    f.write(file_content)
                uploaded_files.append(filepath)
                emit('system_message', {
                    'message': f"File uploaded: {filename}",
                    'type': 'info'
                })
            except Exception as e:
                emit('system_message', {
                    'message': f"Failed to upload file: {str(e)}",
                    'type': 'error'
                })
    
    # Add to history
    command_entry = {
        'command': command,
        'timestamp': datetime.now().isoformat(),
        'session_id': session_id,
        'files': [os.path.basename(f) for f in uploaded_files]
    }
    command_history.append(command_entry)
    
    # Execute command in background
    executor.submit(execute_command_stream, session_id, command, uploaded_files, project_path)

def execute_command_stream(session_id, command, uploaded_files=[], project_path=None):
    """Execute command with real-time output streaming in a specific project directory"""
    try:
        print(f"[DEBUG] Starting command execution for session {session_id}")
        print(f"[DEBUG] Command: {command}")
        print(f"[DEBUG] Project path: {project_path}")
        
        # Use claude with -p flag for prompt mode
        full_command = ['claude', '-p', command]
        
        # If files were uploaded, add them to context
        if uploaded_files:
            file_context = "Context files:\n"
            for filepath in uploaded_files:
                try:
                    with open(filepath, 'r') as f:
                        content = f.read(1000)  # First 1000 chars
                        file_context += f"\n{os.path.basename(filepath)}:\n{content}...\n"
                except:
                    pass
            full_command = ['claude', '-p', f"{file_context}\n\n{command}"]
        
        print(f"[DEBUG] Full command: {full_command}")
        
        # Don't send initial messages - just show responding indicator on client side
        
        # Start process in the specified directory
        process = subprocess.Popen(
            full_command,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,  # Combine stderr with stdout
            text=True,
            bufsize=1,
            universal_newlines=True,
            cwd=project_path,  # Set working directory
            env={**os.environ}  # Ensure environment variables are passed
        )
        
        print(f"[DEBUG] Process started with PID: {process.pid}")
        active_processes[session_id] = process
        
        # Stream output without timeout - runs until process completes or socket disconnects
        output_buffer = ""
        line_count = 0
        
        while True:
            # Check if client is still connected
            if session_id not in active_processes:
                print(f"[DEBUG] Client disconnected, terminating process")
                process.terminate()
                break
                
            output = process.stdout.readline()
            if output == '' and process.poll() is not None:
                break
            if output:
                line_count += 1
                print(f"[DEBUG] Line {line_count}: {output.strip()}")
                output_buffer += output
                socketio.emit('stream_output', {
                    'data': output,
                    'session_id': session_id
                }, room=session_id)
        
        # Get exit code
        return_code = process.poll()
        print(f"[DEBUG] Process exited with code: {return_code}")
        print(f"[DEBUG] Total output: {len(output_buffer)} characters")
        
        # Send final response
        if not output_buffer:
            output_buffer = "No response received from Claude CLI. Please check if Claude is properly installed and configured."
        
        socketio.emit('response', {
            'output': output_buffer,
            'success': return_code == 0,
            'timestamp': datetime.now().isoformat()
        }, room=session_id)
        
        # Clean up
        if session_id in active_processes:
            del active_processes[session_id]
        
        # Clean up uploaded files
        for filepath in uploaded_files:
            try:
                os.remove(filepath)
            except:
                pass
                
    except subprocess.TimeoutExpired:
        socketio.emit('response', {
            'output': 'Command timed out after 60 seconds',
            'success': False,
            'timestamp': datetime.now().isoformat()
        }, room=session_id)
    except FileNotFoundError:
        socketio.emit('response', {
            'output': 'Claude CLI not found. Please ensure Claude is installed and in PATH.',
            'success': False,
            'timestamp': datetime.now().isoformat()
        }, room=session_id)
    except Exception as e:
        socketio.emit('response', {
            'output': f'Error: {str(e)}',
            'success': False,
            'timestamp': datetime.now().isoformat()
        }, room=session_id)

@socketio.on('cancel_command')
def handle_cancel_command():
    """Cancel running command for this session"""
    session_id = request.sid
    if session_id in active_processes:
        try:
            active_processes[session_id].terminate()
            del active_processes[session_id]
            emit('system_message', {
                'message': 'Command cancelled',
                'type': 'warning'
            })
        except Exception as e:
            emit('system_message', {
                'message': f'Failed to cancel: {str(e)}',
                'type': 'error'
            })

@socketio.on('get_history')
def handle_get_history():
    """Get command history for this session"""
    session_id = request.sid
    session_history = [h for h in command_history if h['session_id'] == session_id]
    emit('history', {'commands': session_history[-50:]})  # Last 50 commands

@socketio.on('clear_history')
def handle_clear_history():
    """Clear command history for this session"""
    global command_history
    session_id = request.sid
    command_history = [h for h in command_history if h['session_id'] != session_id]
    emit('system_message', {
        'message': 'History cleared',
        'type': 'info'
    })

@app.route('/download/<path:filename>')
def download_file(filename):
    """Download generated files"""
    try:
        filepath = os.path.join(UPLOAD_FOLDER, secure_filename(filename))
        if os.path.exists(filepath):
            return send_file(filepath, as_attachment=True)
        else:
            return jsonify({'error': 'File not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Project management endpoints
@app.route('/api/projects', methods=['GET'])
def get_projects():
    """Get all projects"""
    return jsonify(project_manager.get_projects())

@app.route('/api/projects', methods=['POST'])
def add_project():
    """Add a new project"""
    data = request.json
    try:
        success = project_manager.add_project(
            data['name'],
            data['path'],
            data.get('description', '')
        )
        if success:
            return jsonify({'success': True, 'message': 'Project added'})
        else:
            return jsonify({'success': False, 'message': 'Project already exists'}), 400
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 400

@app.route('/api/projects/<int:project_id>', methods=['DELETE'])
def delete_project(project_id):
    """Delete a project"""
    project_manager.remove_project(project_id)
    return jsonify({'success': True})

@app.route('/api/projects/scan', methods=['POST'])
def scan_projects():
    """Scan directory for projects"""
    data = request.json
    path = data.get('path', os.path.expanduser('~'))
    max_depth = data.get('max_depth', 2)
    
    try:
        projects = project_manager.scan_directory(path, max_depth)
        return jsonify(projects)
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@socketio.on('select_project')
def handle_select_project(data):
    """Select a project to work with"""
    project_id = data.get('project_id')
    project = project_manager.get_project(project_id)
    
    if project and project['exists']:
        project_manager.update_last_accessed(project_id)
        emit('project_selected', {
            'project': project,
            'message': f"Switched to project: {project['name']}"
        })
    else:
        emit('system_message', {
            'message': 'Project not found or does not exist',
            'type': 'error'
        })

# Cleanup on shutdown
import atexit
def cleanup():
    """Clean up temporary files on shutdown"""
    try:
        shutil.rmtree(UPLOAD_FOLDER)
    except:
        pass

atexit.register(cleanup)

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    print(f"Starting Claude Mobile Interface on port {port}")
    print(f"Upload folder: {UPLOAD_FOLDER}")
    socketio.run(app, host='0.0.0.0', port=port, debug=True, allow_unsafe_werkzeug=True)