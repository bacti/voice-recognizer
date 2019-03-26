import { h, render, Component } from 'preact'
const UUID = require('uuid/v1')

import { Trace, Error } from './log'
import { SPEECH_API_KEY, SERVER_DOMAIN, SERVER_PORT, CLIENT_PORT } from '../config'
import './recorder'
import './index.css'

const BUFFER_SIZE = 2048
const SPEECH_THRESHOLD = 5 // 5 times wrt noise amplitude

var webaudio_tooling_obj = function () {

    var audioContext = new AudioContext();

    console.log("audio is starting up ...");

    var BUFF_SIZE_RENDERER = 16384;

    var audioInput = null,
    microphone_stream = null,
    gain_node = null,
    script_processor_node = null,
    script_processor_analysis_node = null,
    analyser_node = null;

    if (navigator.getUserMedia){

        navigator.getUserMedia({audio:true}, 
            function(stream) {
                start_microphone(stream);
            },
            function(e) {
                alert('Error capturing audio.');
            }
            );

    } else { alert('getUserMedia not supported in this browser.'); }

    // ---

    function show_some_data(given_typed_array, num_row_to_display, label) {

        var size_buffer = given_typed_array.length;
        var index = 0;

        console.log("__________ " + label);

        if (label === "time")
        {

            for (; index < num_row_to_display && index < size_buffer; index += 1) {

                var curr_value_time = (given_typed_array[index] / 128) - 1.0;

                console.log(curr_value_time);
            }

        }
        else
        if (label === "frequency")
        {
            const avgMag = given_typed_array.reduce((acc, val) => acc + Math.abs(val), 0) / num_row_to_display
            console.log(avgMag)

            // for (; index < num_row_to_display && index < size_buffer; index += 1) {

            //     console.log(given_typed_array[index]);
            // }

        }
        else
        {

            throw new Error("ERROR - must pass time or frequency");
        }
    }

    function process_microphone_buffer(event) {

        var i, N, inp, microphone_output_buffer;

        microphone_output_buffer = event.inputBuffer.getChannelData(0); // just mono - 1 channel for now
    }

    function start_microphone(stream){

        gain_node = audioContext.createGain();
        gain_node.connect( audioContext.destination );

        microphone_stream = audioContext.createMediaStreamSource(stream);
        microphone_stream.connect(gain_node); 

        script_processor_node = audioContext.createScriptProcessor(BUFF_SIZE_RENDERER, 1, 1);
        script_processor_node.onaudioprocess = process_microphone_buffer;

        microphone_stream.connect(script_processor_node);

        // --- enable volume control for output speakers

        // document.getElementById('volume').addEventListener('change', function() {

        //     var curr_volume = this.value;
        //     gain_node.gain.value = curr_volume;

        //     console.log("curr_volume ", curr_volume);
        // });

        // --- setup FFT

        script_processor_analysis_node = audioContext.createScriptProcessor(2048, 1, 1);
        script_processor_analysis_node.connect(gain_node);

        analyser_node = audioContext.createAnalyser();
        analyser_node.smoothingTimeConstant = 0;
        analyser_node.fftSize = 2048;

        microphone_stream.connect(analyser_node);

        analyser_node.connect(script_processor_analysis_node);

        var buffer_length = analyser_node.frequencyBinCount;

        var array_freq_domain = new Uint8Array(buffer_length);
        var array_time_domain = new Uint8Array(buffer_length);

        console.log("buffer_length " + buffer_length);

        script_processor_analysis_node.onaudioprocess = function() {

            // get the average for the first channel
            analyser_node.getByteFrequencyData(array_freq_domain);
            analyser_node.getByteTimeDomainData(array_time_domain);

            // draw the spectrogram
            if (microphone_stream.playbackState == microphone_stream.PLAYING_STATE) {

                show_some_data(array_freq_domain, 5, "frequency");
                // show_some_data(array_time_domain, 5, "time"); // store this to record to aggregate buffer/file

// examine array_time_domain for near zero values over some time period

            }
        };
    }

}; //  webaudio_tooling_obj = function()
// webaudio_tooling_obj()

class SpeechToText extends Component
{
    [x: string]: any
    audioContext = new AudioContext()
    state = { url_broadcast: '' }
    noiseMag = 0.01
    lastMag = 0

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

            this.analyserNode = this.audioContext.createAnalyser()
            this.analyserNode.fftSize = 2048
            inputPoint.connect(this.analyserNode)

            this.audioRecorder = new window.Recorder(inputPoint)

            const zeroGain = this.audioContext.createGain()
            zeroGain.gain.value = 0.0
            inputPoint.connect(zeroGain)
            zeroGain.connect(this.audioContext.destination)
            this.updateAnalysers()

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
        this.startButton.disabled = true
        this.speech = 0
        this.silent = 0
        this.recording = true
        this.recordingData = []

        let eouHandler = async _ =>
        {
            if (this.started && this.recording && !this.endOfUtterance)
            {
                setTimeout(eouHandler, 100)
                return
            }
            await this.Stop()
            this.Start()
        }
        setTimeout(eouHandler, 100)
    }

    ProcessAudioBuffer(event)
    {
        const nowBuffering = event.inputBuffer.getChannelData(0)
        const outBuffer = event.outputBuffer.getChannelData(0)

        const avgMag = nowBuffering.reduce((acc, val) => acc + Math.abs(val), 0) / nowBuffering.length
        if (avgMag < this.noiseMag * 2.5)
        {
            this.noiseMag = this.noiseMag * 0.95 + 0.05 * avgMag
            this.noiseMag = Math.min(0.05, this.noiseMag)
        }
        this.lastMag = avgMag
        console.log((this.lastMag / this.noiseMag).toFixed(3))

        if (this.recording)
        {
            let copyBuffer = nowBuffering.slice()
            this.recordingData.push(copyBuffer)
            // outBuffer.set(buffer)

            // End-Of-Utterance recognization
            if (avgMag > this.noiseMag * SPEECH_THRESHOLD)
            {
                this.speech++
                this.silent = 0
            }
            else
            {
                this.silent++
            }

            // Trim audio if user not speech yet
            if (this.speech < 4 && this.recordingData.length > 10)
            {
                this.recordingData = this.recordingData.slice(this.recordingData.length - 10)
                this.speech = Math.max(0, this.speech - 0.2)
            }
        }
        else {
            outBuffer.fill(0)
        }
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
            </div>
        )
    }
}

declare global {
    interface Window {
        main: any,
        Recorder: any,
    }
}
window.main = _ =>
{
    Trace('speech-to-text')
    render(<SpeechToText />, document.body)
}
