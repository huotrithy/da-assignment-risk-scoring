"""Smoke test for dashboard/app.py, run inside the dashboard container:
    docker run --rm --env-file .env -v "$PWD/tests:/tests" credit-risk-dashboard python -m pytest -q /tests/dashboard_smoke.py
(needs pytest; installed on the fly by the command in scripts/berka/README.md)
"""
import os

import streamlit as st
from streamlit.testing.v1 import AppTest

APP = os.environ.get("APP_PATH", "/app/app.py")


def test_app_renders_four_tabs_without_errors():
    at = AppTest.from_file(APP, default_timeout=120).run()
    assert not at.exception, at.exception
    assert not at.error, [e.value for e in at.error]
    assert [t.label for t in at.tabs][:4] == ["Portfolio", "Evidence", "Criteria by grade", "Loan drill-down"]


def test_unreachable_database_shows_readable_error(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@10.255.255.1:5432/x")
    monkeypatch.setenv("DB_CONNECT_TIMEOUT", "2")
    st.cache_data.clear()  # the first test filled the cache; force a real connection attempt
    at = AppTest.from_file(APP, default_timeout=60).run()
    assert any("Cannot connect" in e.value for e in at.error)
