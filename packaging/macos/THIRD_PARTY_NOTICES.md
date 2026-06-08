# Third-Party Notices

This portable package contains iLab GPT Conjure, Python.org CPython for macOS,
and Python packages installed from `requirements-webui.txt`.

## CPython

The bundled Python runtime is distributed by the Python Software Foundation.
See the Python license documentation included with the runtime and the upstream
license information at:

https://docs.python.org/3/license.html

## Python packages

The packaging workflow installs the WebUI dependencies listed in
`requirements-webui.txt` into `app/.deps`. The build script writes a frozen
dependency list to `python-requirements.lock.txt` in the package root.

Review each dependency's license before redistributing modified packages or
using the bundle in a commercial environment.

## iLab GPT Conjure

iLab GPT Conjure is licensed under GNU AGPLv3. See `LICENSE` in the package.
