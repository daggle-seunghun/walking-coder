class SwipeHandler {
    constructor() {
        this.touchStartX = 0;
        this.touchStartY = 0;
        this.touchEndX = 0;
        this.touchEndY = 0;
        this.historyPanel = document.getElementById('historyPanel');
        this.overlay = document.getElementById('overlay');
        this.menuBtn = document.getElementById('menuBtn');
        this.closeHistoryBtn = document.getElementById('closeHistory');
        this.mainContent = document.getElementById('mainContent');
        
        this.init();
    }
    
    init() {
        // Menu button click
        this.menuBtn.addEventListener('click', () => this.toggleHistory());
        
        // Close button click
        this.closeHistoryBtn.addEventListener('click', () => this.closeHistory());
        
        // Overlay click
        this.overlay.addEventListener('click', () => this.closeHistory());
        
        // Swipe detection on main content
        this.mainContent.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: true });
        this.mainContent.addEventListener('touchend', (e) => this.handleTouchEnd(e), { passive: true });
        
        // Swipe detection on history panel
        this.historyPanel.addEventListener('touchstart', (e) => this.handlePanelTouchStart(e), { passive: true });
        this.historyPanel.addEventListener('touchend', (e) => this.handlePanelTouchEnd(e), { passive: true });
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.historyPanel.classList.contains('open')) {
                this.closeHistory();
            }
        });
    }
    
    handleTouchStart(e) {
        this.touchStartX = e.changedTouches[0].screenX;
        this.touchStartY = e.changedTouches[0].screenY;
    }
    
    handleTouchEnd(e) {
        this.touchEndX = e.changedTouches[0].screenX;
        this.touchEndY = e.changedTouches[0].screenY;
        this.handleSwipe();
    }
    
    handlePanelTouchStart(e) {
        this.touchStartX = e.changedTouches[0].screenX;
        this.touchStartY = e.changedTouches[0].screenY;
    }
    
    handlePanelTouchEnd(e) {
        this.touchEndX = e.changedTouches[0].screenX;
        this.touchEndY = e.changedTouches[0].screenY;
        this.handlePanelSwipe();
    }
    
    handleSwipe() {
        const deltaX = this.touchEndX - this.touchStartX;
        const deltaY = Math.abs(this.touchEndY - this.touchStartY);
        
        // Check if swipe is more horizontal than vertical
        if (Math.abs(deltaX) > deltaY) {
            // Right swipe from left edge - open history
            if (deltaX > 50 && this.touchStartX < 30) {
                this.openHistory();
            }
        }
    }
    
    handlePanelSwipe() {
        const deltaX = this.touchEndX - this.touchStartX;
        const deltaY = Math.abs(this.touchEndY - this.touchStartY);
        
        // Check if swipe is more horizontal than vertical
        if (Math.abs(deltaX) > deltaY) {
            // Left swipe - close history
            if (deltaX < -50) {
                this.closeHistory();
            }
        }
    }
    
    toggleHistory() {
        if (this.historyPanel.classList.contains('open')) {
            this.closeHistory();
        } else {
            this.openHistory();
        }
    }
    
    openHistory() {
        this.historyPanel.classList.add('open');
        this.overlay.classList.add('active');
        this.menuBtn.classList.add('active');
        document.body.style.overflow = 'hidden';
        
        // Load history
        if (window.app && window.app.socket) {
            window.app.socket.emit('get_history');
        }
    }
    
    closeHistory() {
        this.historyPanel.classList.remove('open');
        this.overlay.classList.remove('active');
        this.menuBtn.classList.remove('active');
        document.body.style.overflow = '';
    }
}

// Initialize swipe handler when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new SwipeHandler();
});