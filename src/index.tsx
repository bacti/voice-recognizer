import { h, render, Component } from 'preact'
import axios from 'axios'
import { Trace } from './log'
import { SPEECH_API_KEY } from '../config'
import Recorder from './recorder'
import './index.css'

const AudioContext = window.AudioContext || window.webkitAudioContext
const OfflineAudioContext = window.OfflineAudioContext || window.webkitOfflineAudioContext

class SpeechToText extends Component
{
    [x: string]: any
    audioContext = new AudioContext()

    constructor()
    {
        super()
        navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream =>
        {
            const inputPoint = this.audioContext.createGain()
            const realAudioInput = this.audioContext.createMediaStreamSource(stream)
            const audioInput = realAudioInput
            audioInput.connect(inputPoint)

            this.audioRecorder = new Recorder(inputPoint)
            this.analyserNode = this.audioContext.createAnalyser()
            this.analyserNode.fftSize = 2048
            inputPoint.connect(this.analyserNode)
        })
        .catch(e =>
        {
            alert('getUserMedia() error: ' + e)
            console.log(e)
        })
    }

    Start()
    {
        Trace('recording...')
        document.getElementById('log').innerText = 'Recording ...\n'
        this.timestamp = Date.now()
        this.startButton.disabled = true
        this.audioRecorder.Clear()
        this.audioRecorder.Record()
        setTimeout(evt =>
        {
            this.startButton.disabled = false
            this.audioRecorder.Stop()
            this.audioRecorder.GetBuffers(buffers => this.GotBuffers(buffers))
        }, 1000)

    }

    GotBuffers([buffers])
    {
        let freqByteData = new Uint8Array(this.analyserNode.frequencyBinCount)
        this.analyserNode.getByteFrequencyData(freqByteData)
        const freqValues = freqByteData.join('-').replace(/^([12]?\d\-)+|(\-[12]?\d)+$/g, '').split('-')
        const freqMean = freqValues.reduce((acc, val) => acc + +val, 0) / freqValues.length
        document.getElementById('log').innerText += `Frequency Mean: ${freqMean}\n`

        this.DownSampleBuffer(this.audioContext, buffers, 16000)
            .then(buffers =>
            {
                const linear16 = Int16Array.from(buffers, x => x * 32767)
                let base64 = btoa(String.fromCharCode(...new Uint8Array(linear16.buffer)))
                const requestData =
                {
                    'audio': {
                        'content': base64
                    },
                    'config': {
                        'enableAutomaticPunctuation': false,
                        'encoding': 'LINEAR16',
                        'languageCode': 'en-US',
                        'sampleRateHertz': 16000,
                        'maxAlternatives': 30
                    }
                }

                const now = Date.now()
                document.getElementById('log').innerText += `Send sample after ${(now - this.timestamp) / 1000}s\n`
                this.timestamp = now

                axios
                .post('https://speech.googleapis.com/v1/speech:recognize', requestData, { params: { key: SPEECH_API_KEY } })
                .then(({ data }) =>
                {
                    if (!data.results)
                    {
                        Trace('Try again!!')
                        document.getElementById('log').innerText += `Try again!!`
                        return
                    }
                    const [{ alternatives }] = data.results
                    console.log(alternatives)
                    alternatives.forEach(({ transcript, confidence = 1 }) =>
                    {
                        document.getElementById('log').innerText += `* [${transcript}] ${(confidence*100).toFixed(2)}%\n`
                    })
                    const now = Date.now()
                    document.getElementById('log').innerText += `Get transcript in ${(now - this.timestamp) / 1000}s`
                })
            })
    }

    DownSampleBuffer(context, sourceBuffer, targetRate)
    {
        return new Promise<Float32Array>(resolve =>
        {
            if (targetRate == context.sampleRate)
            {
                resolve(sourceBuffer)
                return
            }
            if (targetRate > context.sampleRate)
                throw 'downsampling rate show be smaller than original sample rate'

            const sampleRateRatio = context.sampleRate / targetRate
            const newLength = Math.round(sourceBuffer.length / sampleRateRatio)
            const result = new Float32Array(newLength)
            let offsetResult = 0
            let offsetBuffer = 0
            while (offsetResult < result.length)
            {
                const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio)
                let accum = 0, count = 0
                for (var i = offsetBuffer; i < nextOffsetBuffer && i < sourceBuffer.length; i++)
                {
                    accum += sourceBuffer[i]
                    count++
                }
                result[offsetResult] = accum / count
                offsetResult++
                offsetBuffer = nextOffsetBuffer
            }
            resolve(result)
        })
    }

    Ref(ref, object)
    {
        this[ref] = object
    }

    componentDidMount()
    {
        this.startButton.onclick = _ => this.Start()
    }

    render()
    {
        return (
            <div id='container'>
                <button ref={el => this.Ref('startButton', el)} id='startButton'>Start</button>
                <div id='log'></div>
            </div>
        )
    }
}

declare global
{
    interface Window
    {
        [x: string]: any
    }
}
window.main = _ =>
{
    Trace('speech-to-text')
    render(<SpeechToText />, document.body)
}
