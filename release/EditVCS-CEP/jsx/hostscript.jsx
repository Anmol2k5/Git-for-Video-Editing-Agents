// hostscript.jsx
// This runs in the ExtendScript engine (Premiere Pro DOM)

$._editvcs = {
    
    getActiveProjectPath: function() {
        if (app && app.project && app.project.path) {
            return app.project.path;
        }
        return "";
    },
    
    saveActiveProject: function() {
        if (app && app.project) {
            app.project.save();
            return "SUCCESS";
        }
        return "FAILED";
    },

    alert: function(msg) {
        alert(msg);
    },
    
    getTimelineState: function() {
        if (!app || !app.project || !app.project.activeSequence) {
            return JSON.stringify({ error: "No active sequence" });
        }
        
        var seq = app.project.activeSequence;
        var state = {
            projectName: app.project.name,
            sequenceName: seq.name,
            framerate: seq.timebase,
            videoTracks: [],
            audioTracks: [],
            markers: []
        };
        
        // Extract Video Tracks
        for (var i = 0; i < seq.videoTracks.numTracks; i++) {
            var track = seq.videoTracks[i];
            var trackData = {
                id: "v" + (i + 1),
                name: track.name,
                clips: []
            };
            for (var j = 0; j < track.clips.numItems; j++) {
                var clip = track.clips[j];
                trackData.clips.push({
                    id: clip.nodeId || ("clip_v_" + i + "_" + j),
                    name: clip.name,
                    start: clip.start.seconds,
                    end: clip.end.seconds,
                    inPoint: clip.inPoint.seconds,
                    outPoint: clip.outPoint.seconds,
                    duration: clip.duration.seconds
                });
            }
            state.videoTracks.push(trackData);
        }
        
        // Extract Audio Tracks
        for (var i = 0; i < seq.audioTracks.numTracks; i++) {
            var track = seq.audioTracks[i];
            var trackData = {
                id: "a" + (i + 1),
                name: track.name,
                clips: []
            };
            for (var j = 0; j < track.clips.numItems; j++) {
                var clip = track.clips[j];
                trackData.clips.push({
                    id: clip.nodeId || ("clip_a_" + i + "_" + j),
                    name: clip.name,
                    start: clip.start.seconds,
                    end: clip.end.seconds,
                    inPoint: clip.inPoint.seconds,
                    outPoint: clip.outPoint.seconds,
                    duration: clip.duration.seconds
                });
            }
            state.audioTracks.push(trackData);
        }
        
        // Extract Markers
        if (seq.markers) {
            var numMarkers = seq.markers.numMarkers;
            var marker = seq.markers.getFirstMarker();
            while (marker) {
                state.markers.push({
                    id: marker.guid || marker.name,
                    name: marker.name,
                    start: marker.start.seconds,
                    end: marker.end.seconds,
                    comments: marker.comments
                });
                marker = seq.markers.getNextMarker(marker);
            }
        }
        
        // If ExtendScript JSON object is missing, this would fail, but PPro 14+ supports JSON natively.
        return JSON.stringify(state);
    }
};
