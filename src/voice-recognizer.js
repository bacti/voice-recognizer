import axios from 'axios'
import Recorder from './recorder'
import { Trace, Error } from './log'
const AudioContext = window.AudioContext || window.webkitAudioContext

export default class VoiceRecognizer
{
    constructor(options)
    {
        this.audioContext = new AudioContext()
        this.options = options
    }

    Initialize()
    {
        return new Promise((resolve, reject) =>
            navigator.mediaDevices.getUserMedia({ audio: true })
            .then(stream =>
            {
                const audioInput = this.audioContext.createMediaStreamSource(stream)
                this.audioRecorder = new Recorder(audioInput)
                this.analyserNode = this.audioContext.createAnalyser()
                this.analyserNode.fftSize = 2048
                audioInput.connect(this.analyserNode)
                resolve()
            })
            .catch(e =>
            {
                Error(e)
                reject()
            })
        )
    }

    Start()
    {
        return new Promise(resolve =>
        {
            Trace('recording...')
            document.getElementById('log').innerText = 'Recording ...\n'
            this.timestamp = Date.now()
            this.audioRecorder.Clear()
            this.audioRecorder.Record()
            setTimeout(evt =>
            {
                this.audioRecorder.Stop()
                this.audioRecorder.GetBuffers(buffers => this.GotBuffers(buffers))
                resolve()
            }, 1000)
        })
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
                .post('https://speech.googleapis.com/v1/speech:recognize', requestData, { params: { key: this.googleSpeechKey } })
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
        return new Promise(resolve =>
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
}
