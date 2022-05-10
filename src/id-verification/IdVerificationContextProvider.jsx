import React, { useState, useContext, useEffect } from 'react';
import PropTypes from 'prop-types';
import { AppContext } from '@edx/frontend-platform/react';

import { getProfileDataManager } from '../account-settings/data/service';
import PageLoading from '../account-settings/PageLoading';
import { useAsyncCall } from '../hooks';

import { getExistingIdVerification, getEnrollments } from './data/service';
import AccessBlocked from './AccessBlocked';
import { hasGetUserMediaSupport } from './getUserMediaShim';
import IdVerificationContext, { MEDIA_ACCESS, ERROR_REASONS, VERIFIED_MODES } from './IdVerificationContext';
import { VerifiedNameContext } from './VerifiedNameContext';

export default function IdVerificationContextProvider({ children }) {
  const { authenticatedUser } = useContext(AppContext);
  const { isVerifiedNameHistoryLoading, verifiedName, verifiedNameEnabled } = useContext(VerifiedNameContext);

  // Call verification status endpoint to check whether we can verify.
  const [existingIdVerification, setExistingIdVerification] = useState(null);
  const [isIDVerificationLoading, idVerificationData] = useAsyncCall(getExistingIdVerification);
  const [isEnrollmentsLoading, enrollmentsData] = useAsyncCall(getEnrollments);
  useEffect(() => {
    if (idVerificationData) {
      setExistingIdVerification(idVerificationData);
    }
  }, [idVerificationData]);

  const [facePhotoFile, setFacePhotoFile] = useState(null);
  const [idPhotoFile, setIdPhotoFile] = useState(null);
  const [idPhotoName, setIdPhotoName] = useState(null);
  const [mediaStream, setMediaStream] = useState(null);
  const [mediaAccess, setMediaAccess] = useState(
    hasGetUserMediaSupport ? MEDIA_ACCESS.PENDING : MEDIA_ACCESS.UNSUPPORTED,
  );

  const [canVerify, setCanVerify] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    // With verified name we can redo verification multiple times
    // if not a successful request prevents re-verification
    if (!verifiedNameEnabled && existingIdVerification && !existingIdVerification.canVerify) {
      const { status } = existingIdVerification;
      setCanVerify(false);
      if (status === 'pending' || status === 'approved') {
        setError(ERROR_REASONS.EXISTING_REQUEST);
      } else {
        setError(ERROR_REASONS.CANNOT_VERIFY);
      }
    } else if (verifiedNameEnabled) {
      setCanVerify(true);
    }
  }, [existingIdVerification, verifiedNameEnabled]);

  useEffect(() => {
    if (!isEnrollmentsLoading && enrollmentsData) {
      const verifiedEnrollments = enrollmentsData.filter((enrollment) => (
        VERIFIED_MODES.includes(enrollment.mode)
      ));
      if (verifiedEnrollments.length === 0) {
        setCanVerify(false);
        setError(ERROR_REASONS.COURSE_ENROLLMENT);
      }
    }
  }, [enrollmentsData]);

  const [profileDataManager, setProfileDataManager] = useState(null);
  useEffect(() => {
    // Determine if the user's profile data is managed by a third-party identity provider.
    // If so, they cannot update their account name manually.
    if (authenticatedUser.roles.length > 0) {
      (async () => {
        const thirdPartyManager = await getProfileDataManager(
          authenticatedUser.username,
          authenticatedUser.roles,
        );
        if (thirdPartyManager) {
          setProfileDataManager(thirdPartyManager);
        }
      })();
    }
  }, [authenticatedUser]);

  const [optimizelyExperimentName, setOptimizelyExperimentName] = useState('');
  const [shouldUseCamera, setShouldUseCamera] = useState(false);

  // The following are used to keep track of how a user has submitted photos
  const [portraitPhotoMode, setPortraitPhotoMode] = useState('');
  const [idPhotoMode, setIdPhotoMode] = useState('');

  // If the user reaches the end of the flow and goes back to retake their photos,
  // this flag ensures that they are directed straight back to the summary panel
  const [reachedSummary, setReachedSummary] = useState(false);

  const contextValue = {
    existingIdVerification,
    facePhotoFile,
    idPhotoFile,
    idPhotoName,
    mediaStream,
    mediaAccess,
    userId: authenticatedUser.userId,
    // If the learner has an applicable verified name, then this should override authenticatedUser.name
    // when determining the context value nameOnAccount.
    nameOnAccount: verifiedName || authenticatedUser.name,
    profileDataManager,
    optimizelyExperimentName,
    shouldUseCamera,
    portraitPhotoMode,
    idPhotoMode,
    reachedSummary,
    setExistingIdVerification,
    setFacePhotoFile,
    setIdPhotoFile,
    setIdPhotoName,
    setOptimizelyExperimentName,
    setShouldUseCamera,
    setPortraitPhotoMode,
    setIdPhotoMode,
    setReachedSummary,
    tryGetUserMedia: async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        setMediaAccess(MEDIA_ACCESS.GRANTED);
        setMediaStream(stream);
        setShouldUseCamera(true);
        // stop the stream, as we are not using it yet
        const tracks = stream.getTracks();
        tracks.forEach(track => track.stop());
      } catch (err) {
        setMediaAccess(MEDIA_ACCESS.DENIED);
        setShouldUseCamera(false);
      }
    },
    stopUserMedia: () => {
      if (mediaStream) {
        const tracks = mediaStream.getTracks();
        tracks.forEach(track => track.stop());
        setMediaStream(null);
      }
    },
  };

  // If we are waiting for verification status endpoint, show spinner.
  if (isIDVerificationLoading || isVerifiedNameHistoryLoading) {
    return <PageLoading srMessage="Loading verification status" />;
  }

  if (!canVerify) {
    return <AccessBlocked error={error} />;
  }

  return (
    <IdVerificationContext.Provider value={contextValue}>
      {children}
    </IdVerificationContext.Provider>
  );
}

IdVerificationContextProvider.propTypes = {
  children: PropTypes.node.isRequired,
};
