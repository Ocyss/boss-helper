const Module = require('node:module')

const resolveFilename = Module._resolveFilename

Module._resolveFilename = function resolveVueTscTypescript(request, parent, isMain, options) {
  if (request === 'typescript' || request.startsWith('typescript/')) {
    const suffix = request.slice('typescript'.length)
    return resolveFilename.call(this, `typescript-vue-check${suffix}`, parent, isMain, options)
  }
  return resolveFilename.call(this, request, parent, isMain, options)
}

require('vue-tsc/bin/vue-tsc.js')
