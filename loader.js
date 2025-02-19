const path = require('path')
const matter = require('gray-matter')
const glob = require('glob')
const stringifyObject = require('stringify-object')
const { getOptions } = require('loader-utils')
const { extendFrontMatter, normalizeToUnixPath } = require('./util')

// Loads markdown files with front matter and renders them into a layout.
// Layout can be set using the `layout` key in the front matter, and will map
// to a file name in the pages/layouts directory.
module.exports = async function mdxEnhancedLoader(src) {
  const callback = this.async()
  const options = getOptions(this)

  // Parse the front matter
  let content, data
  try {
    const res = matter(src, { safeLoad: true, filename: this.resourcePath })
    content = res.content
    data = res.data
  } catch (err) {
    callback(err)
  }

  // Get file path relative to project root
  const resourcePath = normalizeToUnixPath(this.resourcePath)
    .replace(
      normalizeToUnixPath(
        path.join(normalizeToUnixPath(this.rootContext), 'pages')
      ),
      ''
    )
    .substring(1)

  // Checks if there's a layout, if there is, resolve the layout and wrap the content in it.
  processLayout
    .call(this, options, data, content, resourcePath)
    .then(result => callback(null, result))
    .catch(err => callback(err))
}

function processLayout(options, frontMatter, content, resourcePath) {
  const { mdxEnhancedPluginOptions: pluginOpts } = options

  return new Promise(async (resolve, reject) => {
    // If no layout is provided and the default layout setting is not on, return the
    // content directly.
    if (!frontMatter.layout && !pluginOpts.defaultLayout)
      return resolve(content)

    // Set the default if the option is active and there's no layout
    if (!frontMatter.layout && pluginOpts.defaultLayout) {
      frontMatter.layout = 'index'
    }

    // Layouts default to resolving from "<root>/layouts", but this is configurable.
    // If the frontMatter doesn't have a layout and defaultLayout is true, try to
    // resolve the index file within the layouts path.
    const layoutPath = path.resolve(
      options.dir,
      pluginOpts.layoutPath,
      frontMatter.layout
    )

    // If the layout doesn't exist, throw a descriptive error
    // We use glob to check for existence, since the file could have multiple page
    // extensions depending on the config
    const layoutMatcher = `${layoutPath}.+(${options.config.pageExtensions.join(
      '|'
    )})`

    const extendedFm = await extendFrontMatter({
      content,
      phase: 'loader',
      extendFm: pluginOpts.extendFrontMatter
    })

    glob(layoutMatcher, (err, matches) => {
      if (err) return reject(err)
      if (!matches.length) {
        throw new Error(
          `File "${resourcePath}" specified "${
            frontMatter.layout
          }" as its layout, but no matching file was found at "${layoutMatcher}"`
        )
      }

      // Import the layout, export the layout-wrapped content, pass front matter into layout
      return resolve(`import layout from '${normalizeToUnixPath(layoutPath)}'

export default layout(${stringifyObject({
        ...frontMatter,
        ...extendedFm,
        ...{ __resourcePath: resourcePath }
      })})

${content}
`)
    })
  })
}
