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
    }
};
