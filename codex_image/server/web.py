from __future__ import annotations

from .app import create_server_app
from .config import ServerSettings


app = create_server_app(ServerSettings.from_env())
