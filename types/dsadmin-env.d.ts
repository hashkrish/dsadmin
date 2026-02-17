declare global {
  interface Window {
    DSADMIN_ENV: {
      DATASTORE_PROJECT_ID: string;
      BASE_PATH: string;
    };
  }
}

export {};
