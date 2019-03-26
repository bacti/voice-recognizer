import { h, render, Component } from 'preact'
const UUID = require('uuid/v1')

import { Trace, Error } from './log'
import { SERVER_DOMAIN, SERVER_PORT, CLIENT_PORT } from '../config'
import './index.css'

class PeerGambler extends Component
{
    state = { url_broadcast: '' }

    constructor()
    {
        super()
    }

    componentDidMount()
    {
    }

    render()
    {
        return (
            <div id='container'>
            </div>
        )
    }
}

declare global {
    interface Window {
        main: any
    }
}

window.main = _ =>
{
    Trace('speech-to-text')
    render(<PeerGambler />, document.body)
}
