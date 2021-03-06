export const Trace = message =>
{
    const log = `${(window.performance.now() / 1000).toFixed(3)}: ${message + []}\n`
    console.warn(log)
    const logdiv = document.getElementById('log')
    logdiv && (logdiv.innerText = log + logdiv.innerText)
}

export const Error = message =>
{
    const now = (window.performance.now() / 1000).toFixed(3)
    console.error(now + ': ', message + [])
}
