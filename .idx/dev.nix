# https://3000-idx-scrunch-1745470198413.cluster-htdgsbmflbdmov5xrjithceibm.cloudworkstations.dev/ 
# To learn more about how to use Nix to configure your environment
# see: https://firebase.google.com/docs/studio/customize-workspace
{ pkgs, ... }: {
  # Which nixpkgs channel to use.
  channel = "stable-23.11"; # or "unstable"
  # Use https://search.nixos.org/packages to find packages
  packages = [
    pkgs.nodejs_20
  ];
  # Sets environment variables in the workspace
  env = {
    API_KEY = "AIzaSyCIbEhF-xjsf4l25bUStI9CoOQvoKoDhUs";
    DATABASE_URL = "https://scrunch-ac497-default-rtdb.asia-southeast1.firebasedatabase.app";
  };
  idx = {
    # Search for the extensions you want on https://open-vsx.org/ and use "publisher.id"
    extensions = [
      "rangav.vscode-thunder-client"
    ];
    workspace = {
      # Runs when a workspace is first created with this `dev.nix` file
      onCreate = {
        npm-install = "npm ci --no-audit --prefer-offline --no-progress --timing";
      };
      # Runs when a workspace is (re)started
      onStart= {
        run-server = "npm run dev";
      };
    };
    previews = {
      enable = true;
      previews = {
        web = {
          command = [];
          manager = "web";
          # Optionally, specify a directory that contains your web app
          # cwd = "app/client";
        };
      };
    };
  };
}