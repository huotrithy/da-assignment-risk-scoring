"""Download the Berka dataset from Kaggle into ./data and load it into SQLite.

Source: https://www.kaggle.com/datasets/marceloventura/the-berka-dataset
Output: ./data/*.csv (raw files) and ./berkadb.dev (SQLite, one table per file)

Usage:
    pip install kagglehub
    python download_berka.py                  # download + import
    python download_berka.py --src ~/Downloads/berka   # skip download, use local files
    python download_berka.py --skip-import    # download only

Kaggle credentials: kagglehub reads ~/.kaggle/kaggle.json or the
KAGGLE_USERNAME / KAGGLE_KEY environment variables if the dataset needs them.
"""
import argparse
import csv
import shutil
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
DB_PATH = ROOT / "berkadb.dev"
DATASET = "marceloventura/the-berka-dataset"
EXTENSIONS = {".csv", ".asc", ".txt"}
BATCH = 50_000

csv.field_size_limit(sys.maxsize)


def download() -> Path:
    try:
        import kagglehub
    except ImportError:
        sys.exit("kagglehub is not installed. Run: pip install kagglehub")
    print(f"Downloading {DATASET} ...")
    return Path(kagglehub.dataset_download(DATASET))


def collect(src: Path) -> list[Path]:
    """Copy the dataset's tabular files into ./data (flattened)."""
    DATA_DIR.mkdir(exist_ok=True)
    files = []
    for f in sorted(src.rglob("*")):
        if f.is_file() and f.suffix.lower() in EXTENSIONS:
            dest = DATA_DIR / f.name
            if f.resolve() != dest.resolve():
                shutil.copy2(f, dest)
            files.append(dest)
    if not files:
        sys.exit(f"No {sorted(EXTENSIONS)} files found under {src}")
    print(f"{len(files)} file(s) in {DATA_DIR}: {', '.join(p.name for p in files)}")
    return files


def sniff_delimiter(path: Path) -> str:
    with path.open(newline="", encoding="utf-8-sig") as fh:
        head = fh.readline()
    return max(";,\t|", key=head.count)


def rows(path: Path, delim: str):
    with path.open(newline="", encoding="utf-8-sig") as fh:
        yield from csv.reader(fh, delimiter=delim)


def to_number(v: str):
    """Return int/float for numeric text, else None."""
    try:
        return int(v)
    except ValueError:
        try:
            return float(v)
        except ValueError:
            return None


def infer_types(path: Path, delim: str, ncols: int) -> list[str]:
    """INTEGER > REAL > TEXT, decided over the whole file. Empty/'?' count as NULL."""
    kinds = ["INTEGER"] * ncols
    it = rows(path, delim)
    next(it)
    for r in it:
        for i in range(min(ncols, len(r))):
            v = r[i].strip()
            if v == "" or v == "?" or kinds[i] == "TEXT":
                continue
            n = to_number(v)
            if n is None:
                kinds[i] = "TEXT"
            elif isinstance(n, float):
                kinds[i] = "REAL"
    return kinds


def clean(v: str, kind: str):
    v = v.strip()
    if v == "" or v == "?":
        return None
    if kind == "TEXT":
        return v
    return to_number(v)


def import_file(con: sqlite3.Connection, path: Path) -> None:
    delim = sniff_delimiter(path)
    header = [h.strip().strip('"') for h in next(rows(path, delim))]
    kinds = infer_types(path, delim, len(header))
    table = path.stem.lower().replace("-", "_").replace(" ", "_")

    cols = ", ".join(f'"{h}" {k}' for h, k in zip(header, kinds))
    con.execute(f'DROP TABLE IF EXISTS "{table}"')
    con.execute(f'CREATE TABLE "{table}" ({cols})')
    sql = f'INSERT INTO "{table}" VALUES ({", ".join("?" * len(header))})'

    it = rows(path, delim)
    next(it)
    batch, total = [], 0
    for r in it:
        if len(r) != len(header):
            continue  # skip malformed lines
        batch.append([clean(v, k) for v, k in zip(r, kinds)])
        if len(batch) >= BATCH:
            con.executemany(sql, batch)
            total += len(batch)
            batch = []
    if batch:
        con.executemany(sql, batch)
        total += len(batch)
    print(f"  {table:<12} {total:>9,} rows  ({delim!r}-delimited, {len(header)} cols)")


def import_db(files: list[Path]) -> None:
    if DB_PATH.exists():
        DB_PATH.unlink()
    con = sqlite3.connect(DB_PATH)
    print(f"Importing into {DB_PATH.name} ...")
    for f in files:
        import_file(con, f)
    con.commit()
    con.close()
    print("Done.")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--src", type=Path, help="use already-downloaded files from this folder instead of Kaggle")
    ap.add_argument("--skip-import", action="store_true", help="download only, don't build the SQLite db")
    args = ap.parse_args()

    src = args.src.expanduser().resolve() if args.src else download()
    files = collect(src)
    if not args.skip_import:
        import_db(files)


if __name__ == "__main__":
    main()
