"""
Project management utilities for Claude Mobile Interface
"""
import os
import json
from pathlib import Path

class ProjectManager:
    def __init__(self, config_file='projects.json'):
        self.config_file = config_file
        self.projects = self.load_projects()
    
    def load_projects(self):
        """Load projects from config file"""
        if os.path.exists(self.config_file):
            with open(self.config_file, 'r') as f:
                return json.load(f)
        return []
    
    def save_projects(self):
        """Save projects to config file"""
        with open(self.config_file, 'w') as f:
            json.dump(self.projects, f, indent=2)
    
    def add_project(self, name, path, description=""):
        """Add a new project"""
        # Expand tilde in path
        expanded_path = os.path.expanduser(path)
        
        # Create directory if it doesn't exist
        if not os.path.exists(expanded_path):
            try:
                os.makedirs(expanded_path, exist_ok=True)
                print(f"Created project directory: {expanded_path}")
            except Exception as e:
                raise ValueError(f"Failed to create directory: {e}")
        
        # Check if project already exists
        for p in self.projects:
            if p['path'] == expanded_path or p['path'] == path:
                return False
        
        project = {
            'id': len(self.projects) + 1,
            'name': name,
            'path': expanded_path,  # Store expanded path
            'description': description,
            'last_accessed': None,
            'has_claude_md': os.path.exists(os.path.join(expanded_path, 'CLAUDE.md'))
        }
        
        self.projects.append(project)
        self.save_projects()
        return True
    
    def remove_project(self, project_id):
        """Remove a project by ID"""
        self.projects = [p for p in self.projects if p['id'] != project_id]
        self.save_projects()
    
    def get_projects(self):
        """Get all projects"""
        # Update project info
        for project in self.projects:
            project['exists'] = os.path.exists(project['path'])
            project['has_claude_md'] = os.path.exists(os.path.join(project['path'], 'CLAUDE.md'))
        return self.projects
    
    def get_project(self, project_id):
        """Get a specific project by ID"""
        for project in self.projects:
            if project['id'] == project_id:
                project['exists'] = os.path.exists(project['path'])
                project['has_claude_md'] = os.path.exists(os.path.join(project['path'], 'CLAUDE.md'))
                return project
        return None
    
    def update_last_accessed(self, project_id):
        """Update last accessed time for a project"""
        from datetime import datetime
        for project in self.projects:
            if project['id'] == project_id:
                project['last_accessed'] = datetime.now().isoformat()
                self.save_projects()
                break
    
    def scan_directory(self, base_path, max_depth=2):
        """Scan directory for potential projects (containing .git, package.json, etc.)"""
        potential_projects = []
        base_path = Path(base_path)
        
        def is_project_dir(path):
            """Check if directory is likely a project"""
            indicators = ['.git', 'package.json', 'requirements.txt', 'Cargo.toml', 
                         'go.mod', 'pom.xml', 'build.gradle', 'CLAUDE.md']
            return any((path / indicator).exists() for indicator in indicators)
        
        def scan_recursive(path, current_depth=0):
            if current_depth >= max_depth:
                return
            
            try:
                for item in path.iterdir():
                    if item.is_dir() and not item.name.startswith('.'):
                        if is_project_dir(item):
                            potential_projects.append({
                                'name': item.name,
                                'path': str(item.absolute()),
                                'has_claude_md': (item / 'CLAUDE.md').exists()
                            })
                        else:
                            scan_recursive(item, current_depth + 1)
            except PermissionError:
                pass
        
        scan_recursive(base_path)
        return potential_projects