import sys
from pathlib import Path

# Allow running the suite without an editable install.
SRC = Path(__file__).resolve().parents[1] / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

CORPUS_DIR = Path(__file__).resolve().parents[3] / "shared" / "corpus"
