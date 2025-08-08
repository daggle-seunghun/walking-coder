class ClaudeMobileApp {
    constructor() {
        this.socket = null;
        this.commandHistory = [];
        this.historyIndex = -1;
        this.isRecording = false;
        this.recognition = null;
        this.isTyping = false;
        this.attachedFiles = [];
        
        this.initSocket();
        this.initUI();
        this.initVoiceRecognition();
        
        // Expose app instance globally for swipe handler
        window.app = this;
    }
    
    initSocket() {
        this.socket = io();
        this.currentStreamMessage = null;
        
        this.socket.on('connect', () => {
            console.log('Connected to server');
            this.updateConnectionStatus(true);
        });
        
        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            this.updateConnectionStatus(false);
        });
        
        this.socket.on('connected', (data) => {
            this.addMessage(data.message, 'system');
            this.sessionId = data.session_id;
        });
        
        this.socket.on('stream_output', (data) => {
            // Handle streaming output
            if (!this.currentStreamMessage) {
                this.hideTypingIndicator();
                this.currentStreamMessage = this.addStreamMessage('', 'assistant');
            }
            this.updateStreamMessage(this.currentStreamMessage, data.data);
        });
        
        this.socket.on('response', (data) => {
            this.hideTypingIndicator();
            if (this.currentStreamMessage) {
                // Update final message
                this.finalizeStreamMessage(this.currentStreamMessage, data.output);
                this.currentStreamMessage = null;
            } else {
                this.addMessage(data.output, 'assistant');
            }
            // Re-enable input
            document.getElementById('sendBtn').disabled = false;
        });
        
        this.socket.on('system_message', (data) => {
            this.addMessage(data.message, 'system');
        });
        
        this.socket.on('history', (data) => {
            this.commandHistory = data.commands || [];
            this.displayHistory();
        });
        
        this.socket.on('error', (data) => {
            this.hideTypingIndicator();
            this.addMessage(`Error: ${data.message}`, 'system');
            document.getElementById('sendBtn').disabled = false;
        });
    }
    
    initUI() {
        const input = document.getElementById('commandInput');
        const sendBtn = document.getElementById('sendBtn');
        const voiceBtn = document.getElementById('voiceBtn');
        const attachBtn = document.getElementById('attachBtn');
        const fileInput = document.getElementById('fileInput');
        const quickBtns = document.querySelectorAll('.quick-btn');
        
        // Send button
        sendBtn.addEventListener('click', () => this.sendCommand());
        
        // Attach button
        attachBtn.addEventListener('click', () => fileInput.click());
        
        // File input change
        fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
        
        // Enter key handling
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendCommand();
            }
            // History navigation
            else if (e.key === 'ArrowUp' && input.value === '') {
                e.preventDefault();
                this.navigateHistory(1);
            }
            else if (e.key === 'ArrowDown') {
                e.preventDefault();
                this.navigateHistory(-1);
            }
        });
        
        // Auto-resize textarea
        input.addEventListener('input', () => {
            input.style.height = 'auto';
            input.style.height = Math.min(input.scrollHeight, 120) + 'px';
        });
        
        // Voice button
        voiceBtn.addEventListener('click', () => this.toggleVoiceRecording());
        
        // Quick command buttons
        quickBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const command = btn.dataset.command;
                this.handleQuickCommand(command);
            });
        });
        
        // Touch feedback
        this.addTouchFeedback();
        
        // Scroll to bottom button
        this.addScrollToBottom();
    }
    
    initVoiceRecognition() {
        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            this.recognition = new SpeechRecognition();
            this.recognition.continuous = true;
            this.recognition.interimResults = true;
            this.recognition.lang = 'en-US';
            
            let finalTranscript = '';
            
            this.recognition.onresult = (event) => {
                let interimTranscript = '';
                
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    const transcript = event.results[i][0].transcript;
                    if (event.results[i].isFinal) {
                        finalTranscript += transcript + ' ';
                    } else {
                        interimTranscript += transcript;
                    }
                }
                
                const input = document.getElementById('commandInput');
                input.value = finalTranscript + interimTranscript;
                this.autoResizeInput(input);
            };
            
            this.recognition.onstart = () => {
                finalTranscript = '';
                document.getElementById('commandInput').placeholder = 'Listening...';
            };
            
            this.recognition.onend = () => {
                this.setRecordingState(false);
                document.getElementById('commandInput').placeholder = 'Ask Claude anything...';
            };
            
            this.recognition.onerror = (event) => {
                console.error('Speech recognition error:', event.error);
                this.setRecordingState(false);
                
                let errorMessage = 'Voice recognition error';
                switch(event.error) {
                    case 'no-speech':
                        errorMessage = 'No speech detected. Please try again.';
                        break;
                    case 'not-allowed':
                        errorMessage = 'Microphone access denied. Please enable it in settings.';
                        break;
                    case 'network':
                        errorMessage = 'Network error. Please check your connection.';
                        break;
                }
                this.addMessage(errorMessage, 'system');
            };
        }
    }
    
    sendCommand() {
        const input = document.getElementById('commandInput');
        const sendBtn = document.getElementById('sendBtn');
        const command = input.value.trim();
        
        if (!command && this.attachedFiles.length === 0) return;
        
        // Disable send button during execution
        sendBtn.disabled = true;
        
        this.addMessage(command, 'user');
        this.showTypingIndicator();
        
        // Send command with attached files if any
        const payload = {
            message: command,
            files: this.attachedFiles
        };
        
        this.socket.emit('command', payload);
        
        // Add to history
        if (command) {
            this.commandHistory.push({
                command: command,
                timestamp: new Date().toISOString(),
                files: this.attachedFiles.length
            });
            this.historyIndex = -1;
        }
        
        // Clear input and files
        input.value = '';
        input.style.height = 'auto';
        this.attachedFiles = [];
        this.updateAttachmentIndicator();
        input.focus();
    }
    
    addMessage(content, type) {
        const output = document.getElementById('output');
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}`;
        
        // Process content based on type
        if (type === 'assistant') {
            messageDiv.innerHTML = this.processContent(content);
            // Highlight code blocks
            setTimeout(() => {
                messageDiv.querySelectorAll('pre code').forEach(block => {
                    Prism.highlightElement(block);
                });
            }, 0);
        } else if (type === 'user') {
            messageDiv.textContent = content;
            if (this.attachedFiles.length > 0) {
                const attachmentIndicator = document.createElement('div');
                attachmentIndicator.className = 'attachment-indicator';
                attachmentIndicator.textContent = `📎 ${this.attachedFiles.length} file(s) attached`;
                messageDiv.appendChild(attachmentIndicator);
            }
        } else {
            messageDiv.textContent = content;
        }
        
        output.appendChild(messageDiv);
        this.scrollToBottom();
        return messageDiv;
    }
    
    addStreamMessage(content, type) {
        const output = document.getElementById('output');
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type} streaming`;
        messageDiv.innerHTML = '<span class="stream-content"></span><span class="stream-cursor">▊</span>';
        output.appendChild(messageDiv);
        this.scrollToBottom();
        return messageDiv;
    }
    
    updateStreamMessage(messageDiv, newContent) {
        const contentSpan = messageDiv.querySelector('.stream-content');
        if (contentSpan) {
            const currentContent = contentSpan.textContent;
            contentSpan.textContent = currentContent + newContent;
            this.scrollToBottom();
        }
    }
    
    finalizeStreamMessage(messageDiv, fullContent) {
        messageDiv.classList.remove('streaming');
        messageDiv.innerHTML = this.processContent(fullContent);
        // Highlight code blocks
        setTimeout(() => {
            messageDiv.querySelectorAll('pre code').forEach(block => {
                Prism.highlightElement(block);
            });
        }, 0);
    }
    
    processContent(content) {
        // Enhanced markdown-like processing
        return content
            // Code blocks with language detection
            .replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
                const language = lang || 'plaintext';
                return `<pre><code class="language-${language}">${this.escapeHtml(code.trim())}</code></pre>`;
            })
            // Inline code
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            // Bold text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            // Italic text
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            // Links
            .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
            // Line breaks
            .replace(/\n/g, '<br>');
    }
    
    escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
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
    
    toggleVoiceRecording() {
        if (!this.recognition) {
            this.addMessage('Voice recognition is not supported on this device', 'system');
            return;
        }
        
        if (this.isRecording) {
            this.recognition.stop();
            this.setRecordingState(false);
        } else {
            // Request microphone permission
            navigator.mediaDevices.getUserMedia({ audio: true })
                .then(() => {
                    this.recognition.start();
                    this.setRecordingState(true);
                })
                .catch(err => {
                    console.error('Microphone access error:', err);
                    this.addMessage('Please allow microphone access to use voice input', 'system');
                });
        }
    }
    
    setRecordingState(recording) {
        this.isRecording = recording;
        const voiceBtn = document.getElementById('voiceBtn');
        
        if (recording) {
            voiceBtn.classList.add('recording');
        } else {
            voiceBtn.classList.remove('recording');
        }
    }
    
    handleQuickCommand(command) {
        const input = document.getElementById('commandInput');
        
        switch(command) {
            case '/clear':
                document.getElementById('output').innerHTML = '';
                this.socket.emit('clear_history');
                this.addMessage('Chat cleared', 'system');
                break;
            case '/history':
                this.socket.emit('get_history');
                // Open history panel
                if (window.swipeHandler) {
                    window.swipeHandler.openHistory();
                }
                break;
            case '/help':
                input.value = '/help';
                this.sendCommand();
                break;
            case '/cancel':
                this.socket.emit('cancel_command');
                document.getElementById('sendBtn').disabled = false;
                break;
            default:
                // For other commands, add to input
                input.value = command + ' ';
                input.focus();
                this.autoResizeInput(input);
                break;
        }
    }
    
    navigateHistory(direction) {
        if (this.commandHistory.length === 0) return;
        
        if (direction > 0 && this.historyIndex < this.commandHistory.length - 1) {
            this.historyIndex++;
        } else if (direction < 0 && this.historyIndex > -1) {
            this.historyIndex--;
        }
        
        const input = document.getElementById('commandInput');
        if (this.historyIndex >= 0) {
            const historyItem = this.commandHistory[this.commandHistory.length - 1 - this.historyIndex];
            input.value = historyItem.command || historyItem;
        } else {
            input.value = '';
        }
        this.autoResizeInput(input);
    }
    
    displayHistory() {
        const historyList = document.getElementById('historyList');
        historyList.innerHTML = '';
        
        if (this.commandHistory.length === 0) {
            historyList.innerHTML = '<div class="history-empty">No command history yet</div>';
            return;
        }
        
        // Display in reverse order (most recent first)
        [...this.commandHistory].reverse().forEach(item => {
            const historyItem = document.createElement('div');
            historyItem.className = 'history-item';
            
            const command = item.command || item;
            const timestamp = item.timestamp ? new Date(item.timestamp).toLocaleTimeString() : '';
            
            historyItem.innerHTML = `
                <div>${this.escapeHtml(command)}</div>
                ${timestamp ? `<div class="history-item-time">${timestamp}</div>` : ''}
            `;
            
            historyItem.addEventListener('click', () => {
                document.getElementById('commandInput').value = command;
                this.autoResizeInput(document.getElementById('commandInput'));
                // Close history panel
                if (window.swipeHandler) {
                    window.swipeHandler.closeHistory();
                }
            });
            
            historyList.appendChild(historyItem);
        });
    }
    
    handleFileSelect(event) {
        const files = Array.from(event.target.files);
        
        files.forEach(file => {
            const reader = new FileReader();
            reader.onload = (e) => {
                this.attachedFiles.push({
                    name: file.name,
                    type: file.type,
                    size: file.size,
                    content: e.target.result
                });
                this.updateAttachmentIndicator();
            };
            reader.readAsDataURL(file);
        });
        
        // Reset file input
        event.target.value = '';
    }
    
    updateAttachmentIndicator() {
        const attachBtn = document.getElementById('attachBtn');
        if (this.attachedFiles.length > 0) {
            attachBtn.style.color = 'var(--primary-color)';
        } else {
            attachBtn.style.color = 'var(--text-secondary)';
        }
    }
    
    showTypingIndicator() {
        const indicator = document.getElementById('typingIndicator');
        indicator.classList.remove('hidden');
        this.scrollToBottom();
    }
    
    hideTypingIndicator() {
        const indicator = document.getElementById('typingIndicator');
        indicator.classList.add('hidden');
    }
    
    scrollToBottom() {
        const main = document.querySelector('.app-main');
        setTimeout(() => {
            main.scrollTop = main.scrollHeight;
        }, 50);
    }
    
    addScrollToBottom() {
        const main = document.querySelector('.app-main');
        let scrollBtn = null;
        
        main.addEventListener('scroll', () => {
            const isNearBottom = main.scrollHeight - main.scrollTop - main.clientHeight < 100;
            
            if (!isNearBottom && !scrollBtn) {
                scrollBtn = document.createElement('button');
                scrollBtn.className = 'scroll-to-bottom';
                scrollBtn.innerHTML = '↓';
                scrollBtn.addEventListener('click', () => this.scrollToBottom());
                main.appendChild(scrollBtn);
            } else if (isNearBottom && scrollBtn) {
                scrollBtn.remove();
                scrollBtn = null;
            }
        });
    }
    
    autoResizeInput(input) {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    }
    
    addTouchFeedback() {
        // Add haptic feedback for iOS
        if ('vibrate' in navigator) {
            document.querySelectorAll('button').forEach(btn => {
                btn.addEventListener('touchstart', () => {
                    navigator.vibrate(10);
                });
            });
        }
        
        // Add visual feedback
        document.querySelectorAll('button, .quick-btn').forEach(btn => {
            btn.addEventListener('touchstart', () => {
                btn.style.transform = 'scale(0.95)';
            });
            btn.addEventListener('touchend', () => {
                setTimeout(() => {
                    btn.style.transform = '';
                }, 100);
            });
        });
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new ClaudeMobileApp();
});