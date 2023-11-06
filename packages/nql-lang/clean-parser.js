const fs = require('fs');

fs.writeFileSync(
    './dist/parser.js',
    fs.readFileSync('./dist/parser.js', 'utf8').replace(
        /exports\.main = function[\s\S]+?\n\}\n/m,
        match => `// We don't use this, and the require() calls here bloat frontend bundles\n/*${match}*/\n`
    )
);
