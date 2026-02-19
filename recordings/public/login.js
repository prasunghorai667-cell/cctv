function enterUser() {
  window.location.href = "/user.html";
}

function enterAdmin() {
  const pass = document.getElementById("adminPass").value;

  if (pass === "admin123") {
    window.location.href = "/admin.html";
  } else {
    alert("Wrong admin password");
  }
}
