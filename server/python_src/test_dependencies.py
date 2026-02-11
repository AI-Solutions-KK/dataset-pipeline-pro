#!/usr/bin/env python3
"""
Test script for the Dataset Pipeline Engine
This script verifies that all dependencies are installed correctly.
"""

import sys
from pathlib import Path

def test_imports():
    """Test if all required libraries can be imported"""
    
    print("="*60)
    print("Testing Python Dependencies")
    print("="*60)
    
    required = {
        'json': 'json (built-in)',
        'os': 'os (built-in)',
        'sys': 'sys (built-in)',
        'pathlib': 'pathlib (built-in)',
        're': 're (built-in)',
        'shutil': 'shutil (built-in)',
        'subprocess': 'subprocess (built-in)',
        'warnings': 'warnings (built-in)',
        'random': 'random (built-in)',
        'statistics': 'statistics (built-in)',
        'collections': 'collections (built-in)',
    }
    
    optional = {
        'PyPDF2': 'PyPDF2',
        'fitz': 'PyMuPDF',
        'paddleocr': 'PaddleOCR',
        'pdf2image': 'pdf2image',
        'nltk': 'NLTK',
        'pandas': 'pandas',
        'symspellpy': 'SymSpell',
        'PIL': 'Pillow',
        'numpy': 'NumPy',
        'cv2': 'opencv-python',
    }
    
    print("\n✓ Required Libraries (Built-in):")
    for module, name in required.items():
        try:
            __import__(module)
            print(f"  ✅ {name}")
        except ImportError:
            print(f"  ❌ {name} - MISSING (but should be built-in!)")
    
    print("\n📦 External Libraries:")
    missing = []
    for module, name in optional.items():
        try:
            __import__(module)
            print(f"  ✅ {name}")
        except ImportError:
            print(f"  ⚠️  {name} - not installed")
            missing.append(name)
    
    print("\n" + "="*60)
    
    if missing:
        print("⚠️  Optional libraries missing:")
        for lib in missing:
            print(f"   - {lib}")
        print("\nInstall with:")
        print("  pip install -r requirements.txt")
    else:
        print("✅ All libraries installed!")
    
    return len(missing) == 0

def test_python_version():
    """Test if Python version is compatible"""
    
    print("\n" + "="*60)
    print("Python Version Check")
    print("="*60)
    
    version = sys.version_info
    print(f"Current Python: {version.major}.{version.minor}.{version.micro}")
    print(f"Recommended: 3.10.11")
    
    if version.major == 3 and version.minor >= 10:
        print("✅ Python version is compatible")
        return True
    else:
        print("⚠️  Python 3.10+ recommended")
        return False

def test_poppler():
    """Test if Poppler is installed (for pdf2image)"""
    
    print("\n" + "="*60)
    print("Poppler Check (for PDF to Image conversion)")
    print("="*60)
    
    import os
    import platform
    
    if platform.system() == "Windows":
        poppler_paths = [
            r"C:\Program Files\poppler\Library\bin",
            r"C:\Program Files (x86)\poppler\Library\bin",
        ]
        
        found = False
        for path in poppler_paths:
            if os.path.exists(path):
                print(f"✅ Poppler found at: {path}")
                found = True
                break
        
        if not found:
            print("⚠️  Poppler not found")
            print("   Download from: https://github.com/oschwartz10612/poppler-windows/releases/")
            print("   Extract to: C:\\Program Files\\poppler\\")
    else:
        # Try to run poppler command
        import subprocess
        try:
            result = subprocess.run(['pdftoppm', '-v'], capture_output=True, text=True)
            print("✅ Poppler is installed")
            print(f"   Version: {result.stderr.split()[2] if result.stderr else 'Unknown'}")
        except FileNotFoundError:
            print("⚠️  Poppler not found")
            print("   Install with:")
            print("   - Linux: sudo apt-get install poppler-utils")
            print("   - macOS: brew install poppler")

def create_test_file():
    """Create a simple test text file"""
    
    print("\n" + "="*60)
    print("Creating Test File")
    print("="*60)
    
    test_dir = Path("test_data")
    test_dir.mkdir(exist_ok=True)
    
    test_file = test_dir / "test_document.txt"
    
    test_content = """
The Adventure of the Test Document

This is a test document for the dataset pipeline. It contains multiple sentences
that will be processed by the cleaning and chunking algorithms. The purpose is
to verify that the pipeline works correctly with real text input.

In this document, we have several paragraphs. Each paragraph contains meaningful
content that should be preserved during the cleaning process. The chunking algorithm
will split this text into appropriate sized chunks for training purposes.

We can also test special characters like quotes "hello" and 'world', as well as
dashes – and — em-dashes. The pipeline should handle these correctly and convert
them to standard ASCII equivalents.

This is sufficient text for testing the basic functionality of the pipeline without
requiring a large PDF file. The system should process this quickly and generate all
the expected output files including chunks, datasets, and evaluation reports.
"""
    
    test_file.write_text(test_content.strip(), encoding="utf-8")
    
    print(f"✅ Created test file: {test_file}")
    print(f"   Size: {len(test_content)} characters")
    
    return test_file

def main():
    """Run all tests"""
    
    print("\n" + "🧪 DATASET PIPELINE - DEPENDENCY TEST")
    print("="*60)
    
    # Test Python version
    python_ok = test_python_version()
    
    # Test imports
    imports_ok = test_imports()
    
    # Test Poppler
    test_poppler()
    
    # Create test file
    test_file = create_test_file()
    
    # Summary
    print("\n" + "="*60)
    print("TEST SUMMARY")
    print("="*60)
    
    if python_ok and imports_ok:
        print("✅ All core dependencies are ready!")
        print(f"\nYou can now test the pipeline with:")
        print(f"  python pipeline_engine.py {test_file}")
    else:
        print("⚠️  Some dependencies are missing")
        print("\nPlease install missing dependencies:")
        print("  pip install -r requirements.txt")
    
    print("\n" + "="*60)

if __name__ == "__main__":
    main()