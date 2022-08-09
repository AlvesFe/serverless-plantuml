module.exports = function caseConverter(name, from, to) {
  if (from === 'kebab' && to === 'camel') {
    return name.replace(/-([a-z])/g, g => g[1].toUpperCase()) 
  }
  if (from === 'camel' && to === 'pascal') {  
    return name.charAt(0).toUpperCase() + name.slice(1)
  }
  if (from === 'camel' && to === 'kebab') {
    return name.replace(/([A-Z])/g, g => '-' + g[0].toLowerCase())
  }
  if (from === 'kebab' && to === 'pascal') {
    return name.replace(/-([a-z])/g, g => g[1].toUpperCase())
  }
  return name;
}