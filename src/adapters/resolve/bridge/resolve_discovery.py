import os
import sys

def get_resolve_module():
    """
    Attempts to import the DaVinciResolveScript module.
    Returns the module if successful, or raises an ImportError with setup instructions.
    """
    try:
        import DaVinciResolveScript as dvr_script
        return dvr_script
    except ImportError:
        pass

    # Try standard installation paths based on OS
    expected_path = ""
    
    if sys.platform.startswith("darwin"):
        expected_path = "/Library/Application Support/Blackmagic Design/DaVinci Resolve/Developer/Scripting/Modules"
    elif sys.platform.startswith("win"):
        expected_path = os.path.expandvars(r"%PROGRAMDATA%\Blackmagic Design\DaVinci Resolve\Support\Developer\Scripting\Modules")
    elif sys.platform.startswith("linux"):
        expected_path = "/opt/resolve/libs/Fusion/Modules"

    # Check environment variable override
    env_path = os.environ.get("EDITVCS_RESOLVE_SCRIPT_PATH")
    
    paths_to_try = [env_path, expected_path]
    
    for path in paths_to_try:
        if path and os.path.exists(path):
            if path not in sys.path:
                sys.path.append(path)
            try:
                import DaVinciResolveScript as dvr_script
                return dvr_script
            except ImportError:
                pass

    error_msg = (
        "Failed to load DaVinciResolveScript module.\n\n"
        "To enable DaVinci Resolve Integration, you must have DaVinci Resolve Studio installed.\n"
        "Ensure Python is configured correctly for Resolve Scripting:\n"
        "1. Check that the Developer/Scripting/Modules path exists.\n"
        "2. Alternatively, set the EDITVCS_RESOLVE_SCRIPT_PATH environment variable to the Modules folder.\n"
    )
    raise ImportError(error_msg)
