/*jslint node:true, vars:true, bitwise:true, unparam:true */
/*jshint unused:true */

/*
A simple node.js application intended to read data from Digital pins on the Intel based development boards such as the Intel(R) Galileo and Edison with Arduino breakout board.

MRAA - Low Level Skeleton Library for Communication on GNU/Linux platforms
Library in C/C++ to interface with Galileo & other Intel platforms, in a structured and sane API with port nanmes/numbering that match boards & with bindings to javascript & python.

Steps for installing MRAA & UPM Library on Intel IoT Platform with IoTDevKit Linux* image
Using a ssh client: 
1. echo "src maa-upm http://iotdk.intel.com/repos/1.1/intelgalactic" > /etc/opkg/intel-iotdk.conf
2. opkg update
3. opkg upgrade

Article: https://software.intel.com/en-us/html5/articles/intel-xdk-iot-edition-nodejs-templates
*/

console.log( 'Starting Shower Saver' );

var exec = require('child_process').exec;

var display = require('intel-edison-lcd-rgb-backlight-display-helper');
display.set(2, 16);
display.clearColor();
display.clearWords();

var mraa = require('mraa'); //require mraa
//console.log('MRAA Version: ' + mraa.getVersion()); //write the mraa version to the console

// button setup
var myDigitalPin6 = new mraa.Gpio(6); //setup digital read on Digital pin #6 (D6)
myDigitalPin6.dir(mraa.DIR_IN); //set the gpio direction to input

var lastPress, lastStats;
lastPress = lastStats = new Date().getTime();
var startTime = 0;

var showerGoalDuration = 30; //6 * 10; // 10 minutes
var showerWarnDuration = 15; //6 * 8;
var showerPunishDuration = showerGoalDuration - showerWarnDuration;

var shwr_timeout = null;
var showerOn = false;

var state = 'off';

function playAudio( nickle )
{
    var command = '"pkill VLC; /Applications/VLC.app/Contents/MacOS/VLC -I dummy ';
    if( nickle )
    {
        command += '~/songs/nickel.mp3 &"'
    }
    else
    {
        command += '~/songs/random.mp3 &"'
    }

    console.log( 'Running Command:', command );
    exec('ssh chris@192.168.5.26 ' + command, function (error, stdout, stderr) {
        console.log('stdout: ' + stdout);
        console.log('stderr: ' + stderr);
        if (error !== null) {
            console.log('exec error: ' + error);
        }
    });
}

function stopAudio()
{
    exec('ssh chris@192.168.5.26 "pkill VLC"', function (error, stdout, stderr) {
        console.log('stdout: ' + stdout);
        console.log('stderr: ' + stderr);
        if (error !== null) {
            console.log('exec error: ' + error);
        }
    });
}

function uploadDuration( duration )
{
    exec('iotkit-admin observation ShowerDuration ' + duration, function (error, stdout, stderr) {
        console.log('stdout: ' + stdout);
        console.log('stderr: ' + stderr);
        if (error !== null) {
            console.log('exec error: ' + error);
        }
    });

}

function cancelTimeout()
{
    clearTimeout(shwr_timeout);
    shwr_timeout = null;
}


function shwr_start()
{
    state = 'started';
    console.log( 'Shower Starting' );
    // set rgb color green
    // display.setColor('green');

    // set text to starting
    display.write('SHOWERING!');

    // start music
    playAudio();

    // set timeout until warning
    cancelTimeout();
    shwr_timeout = setTimeout( shwr_warn, showerWarnDuration * 1000 );
}

function shwr_warn()
{
    state = 'warned';
    console.log( 'Shower Warning' );
    // set rgb color yellow
    // display.setColor('yellow');

    // set text to warn
    display.write('WARNING!');

    // set timeout until punishment
    cancelTimeout();
    shwr_timeout = setTimeout( shwr_punish, showerPunishDuration * 1000 );
}

function shwr_punish()
{
    state = 'punished';
    console.log( 'Shower Punishment!' );
    // set rgb color red
    display.setColor('red');
    
    // set text to punish
    display.write('NICKELBACK!');
    
    // play nickel
    playAudio( true );
}

function shwr_stop()
{
    state = 'off';
    console.log( 'Shower Stopped' );
    display.clearColor();
    display.clearWords();
}

function pad(n, width, z)
{
    z = z || '0';
    n = n + '';
    return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
}

function periodicActivity() //
{
    var theDate = new Date();
    var now = theDate.getTime();
    var delta = Math.round( (now - startTime) / 1000 );

    if( showerOn )
    {
        var progress;
        if( delta > showerWarnDuration ) // in warning or punishment
        {
            progress = ( delta - showerWarnDuration ) / ( showerGoalDuration - showerWarnDuration );
            progress = Math.min( progress, 1.0 );
            // console.log( 'warning percent', progress );
            display.setColorFromTwoColors( 'yellow', 'red', progress )
        }
        else // in shower start
        {
            progress = delta / showerWarnDuration;
            // console.log( 'shower percent', progress );
            display.setColorFromTwoColors( 'green', 'yellow', progress )
        }

        // show timer
        var min = Math.floor( delta / 60 ) ;
        var sec = delta % 60;
        display.write( [null, pad(min,2) + ":" + pad(sec,2)] );
    }

    // main input check
    if( ( now - lastPress ) > 1000 )
    {
        var buttonPressed =  myDigitalPin6.read(); //read the digital value of the pin

        if( buttonPressed )
        {
            lastPress = now;
            if( !showerOn ) // shower on
            {
                showerOn = true;
                startTime = now;
                cancelTimeout();
                shwr_start();
            }
            else // shower off
            {
                showerOn = false;
                stopAudio();
                display.setColor('green');
                display.write( 'DURATION:' );
                cancelTimeout();
                setTimeout(shwr_stop, 3000);

                console.log( 'Total shower duration:', delta, 'seconds' );
                
                // upload duration data to the cloud
                // var stat = {
                //    'n': 'ShowerDuration',
                //    'v': delta
                //};
                uploadDuration( delta );
            }
        }
    }
    
    // stats check
    if( theDate.getDay() === 6 && ( now - lastStats ) > 1000 * 60 * 60 * 24 ) // if it's Saturday and we haven't shown stats in over a day
    {
        lastStats = now;
    }

    setTimeout(periodicActivity, 100); //call the indicated function every 100 ms
}

periodicActivity(); //call the periodicActivity function