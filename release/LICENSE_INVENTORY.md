# RiftCrowd LIVE — Third-Party License Inventory

**Generated:** August 2026

This document lists all third-party dependencies used in RiftCrowd LIVE and their licenses.

## Runtime Dependencies

### Gateway (`@riftcrowd/gateway`)

| Package | Version | License | Repository |
|---------|---------|---------|------------|
| fastify | ^5 | MIT | https://github.com/fastify/fastify |
| @fastify/cors | ^10 | MIT | https://github.com/fastify/fastify-cors |
| @fastify/static | ^8 | MIT | https://github.com/fastify/fastify-static |
| ws | ^8 | MIT | https://github.com/websockets/ws |
| zod | ^3 | MIT | https://github.com/colinhacks/zod |
| pino | ^9 | MIT | https://github.com/pinojs/pino |
| pino-pretty | ^11 | MIT | https://github.com/pinojs/pino-pretty |
| dotenv | ^16 | BSD-2-Clause | https://github.com/motdotla/dotenv |
| nanoid | ^5 | MIT | https://github.com/ai/nanoid |
| archiver | ^7 | MIT | https://github.com/archiverjs/node-archiver |

### Dashboard (`@riftcrowd/dashboard`)

| Package | Version | License | Repository |
|---------|---------|---------|------------|
| react | ^19 | MIT | https://github.com/facebook/react |
| react-dom | ^19 | MIT | https://github.com/facebook/react |
| zod | ^3 | MIT | https://github.com/colinhacks/zod |

### Shared (`@riftcrowd/shared`)

| Package | Version | License | Repository |
|---------|---------|---------|------------|
| zod | ^3 | MIT | https://github.com/colinhacks/zod |

### Launcher (`@riftcrowd-live/launcher`)

| Package | Version | License | Repository |
|---------|---------|---------|------------|
| zod | ^3 | MIT | https://github.com/colinhacks/zod |
| archiver | ^7 | MIT | https://github.com/archiverjs/node-archiver |
| rimraf | ^6 | ISC | https://github.com/isaacs/rimraf |

## Development Dependencies

| Package | Version | License | Used By |
|---------|---------|---------|---------|
| typescript | ^5 | Apache-2.0 | All workspaces |
| vitest | ^3 | MIT | gateway, dashboard, launcher |
| tsx | ^4 | MIT | gateway |
| @types/node | ^22 | MIT | All workspaces |
| @types/ws | ^8 | MIT | gateway |
| @types/archiver | ^6 | MIT | gateway, launcher |
| eslint | ^9 | MIT | root |
| prettier | ^3 | MIT | root |
| typescript-eslint | ^8 | MIT | root |
| @eslint/js | ^9 | MIT | root |
| vite | ^6 | MIT | dashboard |
| @vitejs/plugin-react | ^4 | MIT | dashboard |
| @testing-library/react | ^16 | MIT | dashboard |
| @testing-library/jest-dom | ^6 | MIT | dashboard |
| jsdom | ^25 | MIT | dashboard |

## License Summary

All dependencies use permissive open-source licenses:

- **MIT License:** Most packages (fastify, react, zod, pino, ws, archiver, rimraf, etc.)
- **Apache-2.0:** TypeScript compiler
- **BSD-2-Clause:** dotenv
- **ISC:** rimraf

### MIT License Text (standard)

```
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### Apache-2.0 License (TypeScript)

TypeScript is licensed under the Apache License, Version 2.0. Full text available at:
https://www.apache.org/licenses/LICENSE-2.0

### BSD-2-Clause License (dotenv)

```
Copyright (c) 2015, Scott Motte
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR
ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

### ISC License (rimraf)

```
Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
```

## Godot Engine

The Godot Engine (v4.7.1) is used for the game client and is licensed under the MIT License.
https://godotengine.org/license

## Verification

To verify this inventory is up-to-date:

```bash
npm ls --depth=0 --json
```

Or use `license-checker`:

```bash
npx license-checker --summary
```
