# 🌐 Bore Tunnel Action

[![GitHub Actions](https://img.shields.io/badge/GitHub%20Actions-2088FF?style=for-the-badge&logo=github-actions&logoColor=white)](https://github.com/features/actions)
[![Cross Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20Linux%20%7C%20macOS-blue?style=for-the-badge)](https://github.com/ekzhang/bore)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)

> **Make your local services publicly accessible** 🚀  
> A GitHub Action that exposes local ports to the internet using [Bore](https://github.com/ekzhang/bore) - perfect for testing, demos, and sharing your work!

## ✨ Features

- 🌍 **Cross-platform**: Works on Windows, Linux, and macOS runners
- ⚡ **Fast setup**: Get your tunnel running in seconds
- 🔒 **Secure**: Optional secret-based authentication
- 🧹 **Auto-cleanup**: Automatically terminates tunnels when workflow ends
- 📊 **Detailed logging**: Full visibility into tunnel status
- 🎯 **Simple**: Just specify a port and go!

## 🚀 Quick Start

```yaml
name: Expose Service
on: [ push ]

jobs:
  tunnel:
    runs-on: ubuntu-latest
    steps:
      - name: Start local service
        run: |
          # Start your service on port 3000
          python -m http.server 3000 &

      - name: 🌐 Create tunnel
        uses: lexbritvin/bore-action@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          port: 3000

      - name: Use the tunnel
        run: |
          echo "Service available at: ${{ steps.tunnel.outputs.host }}:${{ steps.tunnel.outputs.port }}"
```

## 📖 Usage

### Basic Example

```yaml
- name: Expose port 8080
  uses: lexbritvin/bore-action@v1
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  with:
    port: 8080
```

### Advanced Example

```yaml
- name: Create secure tunnel
  id: tunnel
  uses: lexbritvin/bore-action@v1
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  with:
    port: 3000
    server: bore.pub
    secret: ${{ secrets.BORE_SECRET }}
    timeout: 60
    version: latest

- name: Display tunnel info
  run: |
    echo "🌐 Tunnel URL: https://${{ steps.tunnel.outputs.host }}:${{ steps.tunnel.outputs.port }}"
    echo "🔌 Host: ${{ steps.tunnel.outputs.host }}"
    echo "📡 Port: ${{ steps.tunnel.outputs.port }}"
```

## ⚙️ Configuration

### Inputs

| Input     | Description                                 | Required | Default    |
|-----------|---------------------------------------------|----------|------------|
| `port`    | Local port to expose                        | Yes      | -          |
| `server`  | Bore server to use                          | No       | `bore.pub` |
| `secret`  | Secret for authentication                   | No       | -          |
| `timeout` | Timeout in seconds for tunnel establishment | No       | `30`       |
| `version` | Bore version to download                    | No       | `latest`   |

### Environment Variables

| Variable       | Description                                                               | Required | Default |
|----------------|---------------------------------------------------------------------------|----------|---------|
| `GITHUB_TOKEN` | GitHub token for API requests (needed for latest version on some runners) | No       | -       |

> **💡 Note**: The `GITHUB_TOKEN` may be needed to request the latest bore version on some runners to avoid GitHub API
> rate limits.

```yaml
env:
  GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### Outputs

| Output | Description             | Example    |
|--------|-------------------------|------------|
| `host` | The public host address | `bore.pub` |
| `port` | The public port number  | `54321`    |

## 🔧 Advanced Configuration

### Custom Bore Server

```yaml
- name: Use custom bore server
  uses: lexbritvin/bore-action@v1
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  with:
    port: 3000
    server: my-bore-server.com
```

### Secure Tunnel with Authentication

```yaml
- name: Create authenticated tunnel
  uses: lexbritvin/bore-action@v1
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  with:
    port: 8080
    secret: ${{ secrets.TUNNEL_SECRET }}
```

## 🛠️ Platform Support

| Platform   | Status         | Notes                                   |
|------------|----------------|-----------------------------------------|
| 🐧 Linux   | ✅ Full Support | Uses `nohup` for background processes   |
| 🪟 Windows | ✅ Full Support | Uses Node.js `spawn` with detached mode |
| 🍎 macOS   | ✅ Full Support | Uses `nohup` for background processes   |

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## ⭐ Support

If this action helped you, please consider giving it a star! ⭐

---

Made with ❤️ for the GitHub Actions community
