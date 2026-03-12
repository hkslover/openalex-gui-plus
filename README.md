# ourresearch-website-2

## Project setup
```
npm install
```

### Compiles and hot-reloads for development
```
npm run serve
```

### Compiles and minifies for production
```
npm run build
```

### Runs as a local app on the current computer
```
npm run build
npm run start:local
```

The local app listens on [http://127.0.0.1:18400](http://127.0.0.1:18400) by default and keeps all Zotero, proxy, and model traffic on the same machine.

### Packages a local executable
```
nvm use 25
npm run package:local
```

This creates a local executable in `release/<platform>-<arch>/` for the current OS. The app still runs entirely on the user's computer and serves the UI at `http://127.0.0.1:18400`.

On macOS the packaging script also applies an ad-hoc `codesign` step so the SEA binary does not get killed immediately by the system.

### Lints and fixes files
```
npm run lint
```

### Customize configuration
See [Configuration Reference](https://cli.vuejs.org/config/).
