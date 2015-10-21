function onSignIn(googleUser) {
	var profile = googleUser.getBasicProfile();
	$('.g-signin2').hide();
	$('.g-signout').removeClass('hidden');

	window.profile = profile;
	console.log('ID: ' + profile.getId()); // Do not send to your backend! Use an ID token instead.
	console.log('Name: ' + profile.getName());
	console.log('Image URL: ' + profile.getImageUrl());
	console.log('Email: ' + profile.getEmail());
	if (profile && profile.getId() && window.location.pathname ==='/auth') {
		window.location.assign('/');
	}
}
function signOut() {
    var auth2 = gapi.auth2.getAuthInstance();
    auth2.signOut().then(function () {
		$('.g-signin2').show();
		$('.g-signout').addClass('hidden');
      console.log('User signed out.');
    });
}

