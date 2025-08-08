class ProjectManager {
    constructor() {
        this.socket = null;
        this.projects = [];
        this.currentProject = null;
        this.isProjectPanelOpen = true;
        this.commandHistory = [];
        this.historyIndex = -1;
        
        this.initSocket();
        this.initUI();
        this.loadProjects();
    }
    
    initSocket() {
        this.socket = io();
        
        this.socket.on('connect', () => {
            console.log('Connected to server');
            this.updateConnectionStatus(true);
        });
        
        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            this.updateConnectionStatus(false);
        });
        
        this.socket.on('project_selected', (data) => {
            this.currentProject = data.project;
            this.updateCurrentProjectDisplay();
            this.addMessage(data.message, 'system');
        });
        
        this.socket.on('stream_output', (data) => {
            this.handleStreamOutput(data);
        });
        
        this.socket.on('response', (data) => {
            this.handleResponse(data);
        });
        
        this.socket.on('system_message', (data) => {
            this.addMessage(data.message, 'system');
        });
    }
    
    initUI() {
        // Menu button
        document.getElementById('menuBtn').addEventListener('click', () => {
            this.toggleProjectPanel();
        });
        
        // Add project button
        document.getElementById('addProjectBtn').addEventListener('click', () => {
            this.showAddProjectModal();
        });
        
        // Project name input - auto-generate path
        document.getElementById('projectName').addEventListener('input', (e) => {
            this.updatePathPreview(e.target.value);
        });
        
        // Scan projects button
        document.getElementById('scanProjectsBtn').addEventListener('click', () => {
            this.scanForProjects();
        });
        
        // Change project button
        document.getElementById('changeProjectBtn').addEventListener('click', () => {
            this.toggleProjectPanel();
        });
        
        // Modal buttons
        document.getElementById('confirmAddBtn').addEventListener('click', () => {
            this.addProject();
        });
        
        document.getElementById('cancelAddBtn').addEventListener('click', () => {
            this.hideAddProjectModal();
        });
        
        // Command input
        const input = document.getElementById('commandInput');
        const sendBtn = document.getElementById('sendBtn');
        
        sendBtn.addEventListener('click', () => this.sendCommand());
        
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendCommand();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                this.navigateHistory(-1);
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                this.navigateHistory(1);
            }
        });
        
        // Auto-resize textarea
        input.addEventListener('input', () => {
            input.style.height = 'auto';
            input.style.height = Math.min(input.scrollHeight, 120) + 'px';
        });
        
        // Quick commands
        document.querySelectorAll('.quick-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const command = btn.dataset.command;
                this.handleQuickCommand(command);
            });
        });
        
        // File attachment
        document.getElementById('attachBtn').addEventListener('click', () => {
            document.getElementById('fileInput').click();
        });
        
        document.getElementById('fileInput').addEventListener('change', (e) => {
            this.handleFileSelect(e);
        });
        
        // Overlay
        document.getElementById('overlay').addEventListener('click', () => {
            this.hideAddProjectModal();
            if (window.innerWidth <= 768) {
                this.closeProjectPanel();
            }
        });
    }
    
    async loadProjects() {
        try {
            const response = await fetch('/api/projects');
            this.projects = await response.json();
            this.renderProjects();
            
            // Auto-select first project if available
            if (this.projects.length > 0 && !this.currentProject) {
                this.selectProject(this.projects[0].id);
            }
        } catch (error) {
            console.error('Failed to load projects:', error);
        }
    }
    
    renderProjects() {
        const projectList = document.getElementById('projectList');
        projectList.innerHTML = '';
        
        this.projects.forEach(project => {
            const item = document.createElement('div');
            item.className = 'project-item';
            if (this.currentProject && this.currentProject.id === project.id) {
                item.classList.add('active');
            }
            
            item.innerHTML = `
                <div class="project-name">${project.name}</div>
                <div class="project-path">${project.path}</div>
                <div class="project-badges">
                    ${project.has_claude_md ? '<span class="project-badge">CLAUDE.md</span>' : ''}
                    ${project.last_accessed ? '<span class="project-badge">Recent</span>' : ''}
                </div>
            `;
            
            item.addEventListener('click', () => this.selectProject(project.id));
            projectList.appendChild(item);
        });
    }
    
    selectProject(projectId) {
        this.socket.emit('select_project', { project_id: projectId });
        
        // Update UI immediately
        const project = this.projects.find(p => p.id === projectId);
        if (project) {
            this.currentProject = project;
            this.updateCurrentProjectDisplay();
            this.renderProjects();
            
            // Close panel on mobile after selection
            if (window.innerWidth <= 768) {
                this.closeProjectPanel();
            }
        }
    }
    
    updateCurrentProjectDisplay() {
        const label = document.querySelector('.project-label');
        if (this.currentProject) {
            label.textContent = `📁 ${this.currentProject.name}`;
        } else {
            label.textContent = 'No project selected';
        }
    }
    
    toggleProjectPanel() {
        const panel = document.getElementById('projectPanel');
        const main = document.getElementById('mainContent');
        const overlay = document.getElementById('overlay');
        
        this.isProjectPanelOpen = !this.isProjectPanelOpen;
        
        if (window.innerWidth <= 768) {
            // Mobile behavior
            if (this.isProjectPanelOpen) {
                panel.classList.add('open');
                overlay.classList.add('active');
            } else {
                panel.classList.remove('open');
                overlay.classList.remove('active');
            }
        } else {
            // Desktop behavior
            if (this.isProjectPanelOpen) {
                panel.classList.remove('hidden');
                main.classList.remove('sidebar-hidden');
            } else {
                panel.classList.add('hidden');
                main.classList.add('sidebar-hidden');
            }
        }
        
        // Update menu button
        const menuBtn = document.getElementById('menuBtn');
        menuBtn.classList.toggle('active', this.isProjectPanelOpen);
    }
    
    closeProjectPanel() {
        if (this.isProjectPanelOpen) {
            this.toggleProjectPanel();
        }
    }
    
    showAddProjectModal() {
        document.getElementById('addProjectModal').classList.remove('hidden');
        document.getElementById('overlay').classList.add('active');
    }
    
    hideAddProjectModal() {
        document.getElementById('addProjectModal').classList.add('hidden');
        document.getElementById('overlay').classList.remove('active');
        
        // Clear inputs
        document.getElementById('projectName').value = '';
        document.getElementById('pathPreview').textContent = '~/projects/';
        document.getElementById('projectDescription').value = '';
    }
    
    updatePathPreview(projectName) {
        const pathPreview = document.getElementById('pathPreview');
        if (projectName) {
            // Convert to kebab-case
            const kebabCase = projectName
                .toLowerCase()
                .replace(/\s+/g, '-')
                .replace(/[^a-z0-9-]/g, '');
            pathPreview.textContent = `~/projects/${kebabCase}`;
        } else {
            pathPreview.textContent = '~/projects/';
        }
    }
    
    async addProject() {
        const name = document.getElementById('projectName').value.trim();
        const description = document.getElementById('projectDescription').value.trim();
        
        if (!name) {
            alert('Please enter project name');
            return;
        }
        
        // Generate path from name
        const kebabCase = name
            .toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/[^a-z0-9-]/g, '');
        const path = `~/projects/${kebabCase}`;
        
        try {
            const response = await fetch('/api/projects', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ name, path, description })
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.hideAddProjectModal();
                this.loadProjects();
                this.addMessage('Project added successfully', 'system');
            } else {
                alert(result.message || 'Failed to add project');
            }
        } catch (error) {
            console.error('Failed to add project:', error);
            alert('Failed to add project');
        }
    }
    
    async scanForProjects() {
        const path = prompt('Enter directory path to scan (leave empty for home directory):');
        
        const scanBtn = document.getElementById('scanProjectsBtn');
        scanBtn.classList.add('loading');
        scanBtn.disabled = true;
        
        try {
            const response = await fetch('/api/projects/scan', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    path: path || undefined,
                    max_depth: 2 
                })
            });
            
            const projects = await response.json();
            
            if (Array.isArray(projects) && projects.length > 0) {
                const message = `Found ${projects.length} potential projects. Would you like to add them?`;
                if (confirm(message)) {
                    for (const project of projects) {
                        await fetch('/api/projects', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                name: project.name,
                                path: project.path,
                                description: `Auto-discovered project${project.has_claude_md ? ' (has CLAUDE.md)' : ''}`
                            })
                        });
                    }
                    this.loadProjects();
                    this.addMessage(`Added ${projects.length} projects`, 'system');
                }
            } else {
                alert('No projects found in the specified directory');
            }
        } catch (error) {
            console.error('Failed to scan for projects:', error);
            alert('Failed to scan for projects');
        } finally {
            scanBtn.classList.remove('loading');
            scanBtn.disabled = false;
        }
    }
    
    sendCommand() {
        const input = document.getElementById('commandInput');
        const sendBtn = document.getElementById('sendBtn');
        const command = input.value.trim();
        
        if (!command) return;
        
        if (!this.currentProject) {
            alert('Please select a project first');
            return;
        }
        
        sendBtn.disabled = true;
        
        this.addMessage(command, 'user');
        // Show simple responding indicator instead of typing animation
        this.showRespondingIndicator();
        
        const payload = {
            message: command,
            project_path: this.currentProject.path,
            files: []
        };
        
        this.socket.emit('command', payload);
        
        // Add to history
        this.commandHistory.push(command);
        this.historyIndex = this.commandHistory.length;
        
        input.value = '';
        input.style.height = 'auto';
        input.focus();
    }
    
    navigateHistory(direction) {
        const input = document.getElementById('commandInput');
        
        if (direction === -1 && this.historyIndex > 0) {
            this.historyIndex--;
            input.value = this.commandHistory[this.historyIndex];
        } else if (direction === 1 && this.historyIndex < this.commandHistory.length - 1) {
            this.historyIndex++;
            input.value = this.commandHistory[this.historyIndex];
        } else if (direction === 1 && this.historyIndex === this.commandHistory.length - 1) {
            this.historyIndex = this.commandHistory.length;
            input.value = '';
        }
        
        // Resize input
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    }
    
    handleQuickCommand(command) {
        const input = document.getElementById('commandInput');
        
        switch(command) {
            case '/help':
                this.sendCommand();
                break;
            case '/clear':
                document.getElementById('output').innerHTML = '';
                this.addMessage('Chat cleared', 'system');
                break;
            case '/history':
                this.socket.emit('get_history');
                break;
            case '/cancel':
                this.socket.emit('cancel_command');
                document.getElementById('sendBtn').disabled = false;
                break;
            default:
                input.value = command + ' ';
                input.focus();
                break;
        }
    }
    
    addMessage(content, type) {
        const output = document.getElementById('output');
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}`;
        
        if (type === 'assistant') {
            messageDiv.innerHTML = this.processContent(content);
            setTimeout(() => {
                messageDiv.querySelectorAll('pre code').forEach(block => {
                    if (typeof Prism !== 'undefined') {
                        Prism.highlightElement(block);
                    }
                });
            }, 0);
        } else {
            messageDiv.textContent = content;
        }
        
        output.appendChild(messageDiv);
        this.scrollToBottom();
    }
    
    handleStreamOutput(data) {
        this.hideTypingIndicator();
        
        if (!this.currentStreamMessage) {
            this.currentStreamMessage = this.addStreamMessage();
        }
        
        // Check for special markers in Claude's output
        if (data.data.includes('Creating file:') || data.data.includes('Writing to:')) {
            this.showFileActivity(data.data);
        }
        
        this.updateStreamMessage(this.currentStreamMessage, data.data);
    }
    
    showFileActivity(text) {
        // Extract filename from the text
        const match = text.match(/(?:Creating file:|Writing to:)\s*(.+)/);
        if (match && match[1]) {
            const filename = match[1].trim();
            this.showToast(`📝 Creating: ${filename}`, 'info');
        }
    }
    
    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.classList.add('show');
        }, 100);
        
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
    
    handleResponse(data) {
        this.hideTypingIndicator();
        
        if (this.currentStreamMessage) {
            this.finalizeStreamMessage(this.currentStreamMessage, data.output);
            this.currentStreamMessage = null;
        } else {
            this.addMessage(data.output, 'assistant');
        }
        
        document.getElementById('sendBtn').disabled = false;
    }
    
    addStreamMessage() {
        const output = document.getElementById('output');
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message assistant streaming';
        messageDiv.innerHTML = '<span class="stream-content"></span><span class="stream-cursor">▊</span>';
        output.appendChild(messageDiv);
        this.scrollToBottom();
        return messageDiv;
    }
    
    updateStreamMessage(messageDiv, newContent) {
        const contentSpan = messageDiv.querySelector('.stream-content');
        if (contentSpan) {
            contentSpan.textContent += newContent;
            this.scrollToBottom();
        }
    }
    
    finalizeStreamMessage(messageDiv, fullContent) {
        messageDiv.classList.remove('streaming');
        messageDiv.innerHTML = this.processContent(fullContent);
        
        setTimeout(() => {
            messageDiv.querySelectorAll('pre code').forEach(block => {
                if (typeof Prism !== 'undefined') {
                    Prism.highlightElement(block);
                }
            });
        }, 0);
    }
    
    processContent(content) {
        // Enhanced markdown processing for Claude's output
        return content
            // Code blocks with language detection
            .replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
                const language = lang || 'plaintext';
                const escapedCode = this.escapeHtml(code.trim());
                return `<div class="code-block">
                    <div class="code-header">
                        <span class="code-lang">${language}</span>
                        <button class="copy-btn" onclick="navigator.clipboard.writeText(\`${escapedCode}\`)">Copy</button>
                    </div>
                    <pre><code class="language-${language}">${escapedCode}</code></pre>
                </div>`;
            })
            // File paths
            .replace(/([\/\w\-\.]+\.\w+)/g, '<span class="file-path">$1</span>')
            // Inline code
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            // Bold text
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
            // Italic text
            .replace(/\*([^*]+)\*/g, '<em>$1</em>')
            // Lists
            .replace(/^\s*[-*]\s+(.+)$/gm, '<li>$1</li>')
            .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
            // Line breaks
            .replace(/\n/g, '<br>');
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    showRespondingIndicator() {
        const output = document.getElementById('output');
        const indicator = document.createElement('div');
        indicator.className = 'responding-indicator';
        indicator.id = 'respondingIndicator';
        indicator.innerHTML = '<span class="responding-text">Responding...</span>';
        output.appendChild(indicator);
        this.scrollToBottom();
    }
    
    hideRespondingIndicator() {
        const indicator = document.getElementById('respondingIndicator');
        if (indicator) {
            indicator.remove();
        }
    }
    
    showTypingIndicator() {
        // Deprecated - use showRespondingIndicator instead
        this.showRespondingIndicator();
    }
    
    hideTypingIndicator() {
        // Deprecated - use hideRespondingIndicator instead
        this.hideRespondingIndicator();
    }
    
    scrollToBottom() {
        const main = document.getElementById('mainContent');
        main.scrollTop = main.scrollHeight;
    }
    
    updateConnectionStatus(connected) {
        const indicator = document.querySelector('.status-indicator');
        const text = document.querySelector('.status-text');
        
        if (connected) {
            indicator.classList.add('connected');
            text.textContent = 'Connected';
        } else {
            indicator.classList.remove('connected');
            text.textContent = 'Disconnected';
        }
    }
    
    handleFileSelect(event) {
        // File handling logic
        const files = event.target.files;
        if (files.length > 0) {
            this.addMessage(`${files.length} file(s) selected`, 'system');
        }
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.projectManager = new ProjectManager();
});